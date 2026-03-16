/**
 * Task Worker — run as a separate process: `pnpm worker`
 * Consumes the BullMQ "task-execution" queue and calls agent-runner.
 */
import '../config'; // trigger env validation early
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config';
import { runAgentOnTask } from './agent-runner';
import { unblockDependents } from '../modules/tasks/tasks.service';
import { runMarketIntelligenceCycle } from '../modules/network/market-intelligence.service';
import { runOptimizationEngine } from '../modules/optimization/engine.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { TaskJobData } from '../modules/tasks/tasks.queue';

const worker = new Worker<TaskJobData>(
  'task-execution',
  async (job) => {
    const { taskId } = job.data;
    logger.info({ taskId, jobId: job.id }, 'Starting task execution');

    await job.updateProgress(10);
    await runAgentOnTask(taskId);
    await job.updateProgress(90);

    // Unblock any dependent tasks
    const unblockedIds = await unblockDependents(taskId);
    if (unblockedIds.length > 0) {
      logger.info({ taskId, unblockedIds }, 'Unblocked dependent tasks');
    }

    await job.updateProgress(100);
    logger.info({ taskId, jobId: job.id }, 'Task execution completed');

    // Threshold trigger: auto-optimize if a user has 20+ completed tasks since last run
    triggerOptimizationIfThreshold(job.data).catch(() => {});
  },
  {
    connection: redis as any,
    concurrency: config.WORKER_CONCURRENCY,
    limiter: { max: 100, duration: 60_000 },
  },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, taskId: job?.data.taskId, err: err.message }, 'Task job failed');
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info({ concurrency: config.WORKER_CONCURRENCY }, '🤖 Task worker started');

// ── Stale task recovery ───────────────────────────────────────────────────────
// On startup: any task/execution stuck in RUNNING for >30 min is orphaned.
// Reset them to QUEUED and re-enqueue so they get retried automatically.
async function recoverStaleTasks() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  // Find orphaned executions
  const stale = await prisma.taskExecution.findMany({
    where: { status: 'RUNNING', startedAt: { lt: thirtyMinutesAgo } },
    select: { id: true, taskId: true, agentId: true },
  });

  if (stale.length === 0) return;
  logger.warn({ count: stale.length }, '♻️  Recovering stale tasks');

  // Fail all stale executions
  await prisma.taskExecution.updateMany({
    where: { id: { in: stale.map((e) => e.id) } },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage: 'Worker crashed — recovered on restart' },
  });

  // Deduplicate by taskId — only re-enqueue each task once
  const seenTaskIds = new Set<string>();
  const { taskQueue } = await import('../modules/tasks/tasks.queue');

  for (const exec of stale) {
    // Reset agent currentTaskCount if it drifted
    if (exec.agentId) {
      await prisma.agentRegistration.update({
        where: { id: exec.agentId },
        data: { status: 'IDLE', currentTaskCount: { decrement: 1 } },
      }).catch(() => {}); // ignore if already 0
    }

    if (seenTaskIds.has(exec.taskId)) continue; // skip duplicate enqueues
    seenTaskIds.add(exec.taskId);

    await prisma.task.update({
      where: { id: exec.taskId },
      data: { status: 'QUEUED', startedAt: null },
    });

    const job = await taskQueue.add('task-execution', { taskId: exec.taskId });
    // Set queueJobId so future stale recovery passes don't re-add it
    await prisma.task.update({
      where: { id: exec.taskId },
      data: { queueJobId: job.id?.toString() ?? null },
    });
    logger.info({ taskId: exec.taskId, jobId: job.id }, '♻️  Re-enqueued stale task');
  }
}

recoverStaleTasks().catch((err) => logger.warn({ err }, 'Stale task recovery failed'));

// Threshold-based optimization trigger
const THRESHOLD_TASK_COUNT = 20;
async function triggerOptimizationIfThreshold(jobData: TaskJobData) {
  const task = await prisma.task.findUnique({
    where: { id: jobData.taskId },
    include: { project: { select: { ownerId: true } } },
  });
  if (!task?.project?.ownerId) return;

  const userId = task.project.ownerId;

  // Count completed tasks since the last optimization run
  const lastRun = await prisma.optimizationRun.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const completedSince = await prisma.taskExecution.count({
    where: {
      agent: { userId },
      status: 'COMPLETED',
      ...(lastRun ? { startedAt: { gte: lastRun.createdAt } } : {}),
    },
  });

  if (completedSince >= THRESHOLD_TASK_COUNT) {
    logger.info({ userId, completedSince }, '🔄 Threshold reached — running auto-optimization');
    runOptimizationEngine(userId, 'threshold').catch((err) =>
      logger.warn({ err }, 'Threshold optimization failed')
    );
  }
}

// ── Scheduled task poller ─────────────────────────────────────────────────────
// Catch any tasks whose scheduledAt has passed but weren't enqueued (e.g. server restart)
async function enqueueOverdueTasks() {
  const overdue = await prisma.task.findMany({
    where: { status: 'QUEUED', scheduledAt: { lte: new Date() }, queueJobId: null },
    select: { id: true },
    take: 50,
  });
  for (const t of overdue) {
    const { taskQueue } = await import('../modules/tasks/tasks.queue');
    await taskQueue.add('task-execution', { taskId: t.id });
    logger.info({ taskId: t.id }, '⏰ Enqueued overdue scheduled task');
  }
}
enqueueOverdueTasks().catch(() => {});
setInterval(() => enqueueOverdueTasks().catch(() => {}), 60_000); // check every minute

// Run market intelligence cycle on startup then every 6 hours
runMarketIntelligenceCycle().catch((err) => logger.warn({ err }, 'Initial market intel cycle failed'));
setInterval(() => {
  runMarketIntelligenceCycle().catch((err) => logger.warn({ err }, 'Market intel cycle failed'));
}, 6 * 60 * 60 * 1000);

// Daily scheduled optimization — runs at startup check then every 24 hours
// (Only fires if there's been meaningful activity since the last run)
setInterval(async () => {
  try {
    // Get all users who have agents
    const users = await prisma.user.findMany({
      where: { agents: { some: {} } },
      select: { id: true },
    });
    for (const u of users) {
      runOptimizationEngine(u.id, 'scheduled').catch((err) =>
        logger.warn({ userId: u.id, err }, 'Scheduled optimization failed')
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Daily optimization schedule failed');
  }
}, 24 * 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  logger.info('Worker shut down gracefully');
  process.exit(0);
});
