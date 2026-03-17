import { prisma } from '../../config/database';
import { taskQueue } from './tasks.queue';
import type { TaskStatus, TaskPriority } from '@prisma/client';

export async function listTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId, parentTaskId: null },
    include: {
      subTasks: { include: { subTasks: true } },
      blockedBy: { select: { blockingTaskId: true } },
      blocks: { select: { dependentTaskId: true } },
      executions: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getTask(id: string, projectId: string) {
  const task = await prisma.task.findFirst({
    where: { id, projectId },
    include: {
      subTasks: { include: { subTasks: true } },
      blockedBy: { select: { blockingTaskId: true } },
      blocks: { select: { dependentTaskId: true } },
      executions: {
        orderBy: { startedAt: 'desc' },
        include: { logs: { orderBy: { timestamp: 'asc' }, take: 100 } },
      },
    },
  });
  if (!task) throw new Error('Task not found');
  return task;
}

export async function createTask(projectId: string, data: {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependsOn?: string[];
  scheduledAt?: string;
  deadline?: string;
  maxRetries?: number;
}) {
  return prisma.task.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      acceptanceCriteria: data.acceptanceCriteria,
      priority: data.priority ?? 'MEDIUM',
      assignedAgentId: data.assignedAgentId,
      parentTaskId: data.parentTaskId,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      maxRetries: data.maxRetries ?? 3,
      blockedBy: data.dependsOn?.length
        ? { create: data.dependsOn.map((blockingTaskId) => ({ blockingTaskId })) }
        : undefined,
    },
  });
}

export async function updateTask(id: string, projectId: string, data: Record<string, unknown>) {
  const task = await prisma.task.findFirst({ where: { id, projectId } });
  if (!task) throw new Error('Task not found');
  return prisma.task.update({ where: { id }, data: data as any });
}

export async function deleteTask(id: string, projectId: string) {
  const task = await prisma.task.findFirst({ where: { id, projectId } });
  if (!task) throw new Error('Task not found');
  await prisma.task.delete({ where: { id } });
}

export async function retryTask(id: string, projectId: string) {
  const task = await prisma.task.findFirst({ where: { id, projectId } });
  if (!task) throw new Error('Task not found');
  if (task.status !== 'FAILED') throw new Error('Only failed tasks can be retried');

  await prisma.task.update({ where: { id }, data: { status: 'QUEUED', retryCount: 0 } });
  await taskQueue.add('task-execution', { taskId: id }, { jobId: `retry-${id}-${Date.now()}` });
}

export async function cancelTask(id: string, projectId: string) {
  const task = await prisma.task.findFirst({ where: { id, projectId } });
  if (!task) throw new Error('Task not found');
  if (['completed', 'cancelled'].includes(task.status.toLowerCase())) {
    throw new Error('Task already completed or cancelled');
  }

  if (task.queueJobId) {
    const job = await taskQueue.getJob(task.queueJobId);
    await job?.remove();
  }

  return prisma.task.update({ where: { id }, data: { status: 'CANCELLED' } });
}

export async function getExecutionLogs(executionId: string) {
  return prisma.executionLog.findMany({
    where: { executionId },
    orderBy: { timestamp: 'asc' },
  });
}

// Called by orchestrator after a task completes — unblocks dependents
export async function unblockDependents(completedTaskId: string): Promise<string[]> {
  const dependents = await prisma.taskDependency.findMany({
    where: { blockingTaskId: completedTaskId },
    include: {
      dependent: {
        include: { blockedBy: true },
      },
    },
  });

  const unblockedIds: string[] = [];

  for (const dep of dependents) {
    const task = dep.dependent;
    if (task.status !== 'BLOCKED' && task.status !== 'PENDING') continue;

    // Check if ALL blocking tasks are now complete
    const allBlocking = await prisma.taskDependency.findMany({
      where: { dependentTaskId: task.id },
      include: { blocking: true },
    });

    const allDone = allBlocking.every((b) => b.blocking.status === 'COMPLETED');
    if (allDone) {
      await prisma.task.update({ where: { id: task.id }, data: { status: 'QUEUED' } });
      await taskQueue.add('task-execution', { taskId: task.id }, { jobId: task.id });
      unblockedIds.push(task.id);
    }
  }

  return unblockedIds;
}

export async function scheduleTask(taskId: string, projectId: string, scheduledAt: Date): Promise<{ taskId: string; scheduledAt: Date; delayMs: number }> {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) throw new Error('Task not found');
  if (!['PENDING', 'QUEUED'].includes(task.status)) throw new Error(`Cannot schedule a task with status ${task.status}`);

  const now = Date.now();
  const delayMs = Math.max(0, scheduledAt.getTime() - now);

  await prisma.task.update({
    where: { id: taskId },
    data: { scheduledAt, status: 'QUEUED' },
  });

  await taskQueue.add('task-execution', { taskId }, { delay: delayMs });

  return { taskId, scheduledAt, delayMs };
}
