/**
 * Human Intervention Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Allows the human operator to step into the autonomous flow at any point:
 *
 *  1. MESSAGE AN AGENT — inject a human message into an agent's active conversation
 *     so the next LLM call incorporates the human's input
 *
 *  2. OVERRIDE A TASK — rewrite the task description/goal mid-execution
 *     (current execution is gracefully stopped; a new one starts with updated params)
 *
 *  3. TAKE OVER A DEPARTMENT — pause all tasks in a department so the human
 *     can handle them manually, then resume when done
 *
 *  4. INJECT CONTEXT — add a note/document to an agent's memory that it will
 *     read in its next execution
 *
 *  5. REDIRECT — reassign a running task to a different agent
 *
 * All interventions are logged in AuditLog with action = 'intervention.*'
 */
import { prisma } from '../../config/database';
import { publishEvent } from '../events/events.service';
import { taskQueue } from '../tasks/tasks.queue';
import { redis } from '../../config/redis';

// Key pattern for pending human messages (consumed by agent-runner on next turn)
const humanMsgKey = (agentId: string) => `agent-hub:human-msg:${agentId}`;

// ── 1. Message an agent ───────────────────────────────────────────────────────

export async function messageAgent(
  userId: string,
  agentId: string,
  message: string,
  projectId: string,
): Promise<void> {
  // Store in Redis — agent-runner polls this before each LLM turn
  await redis.lpush(humanMsgKey(agentId), JSON.stringify({ message, from: 'human', ts: Date.now() }));
  await redis.expire(humanMsgKey(agentId), 3600); // 1hr TTL

  // Broadcast to feed so it's visible
  await publishEvent('agent:message', {
    fromAgentId: 'human',
    fromAgentName: '👤 You (Human)',
    toAgentId: agentId,
    projectId,
    message: `[TO AGENT] ${message}`,
    timestamp: new Date().toISOString(),
  });

  await audit(userId, 'intervention.message_agent', 'Agent', agentId, { message, projectId });
}

// ── 2. Override a task ────────────────────────────────────────────────────────

export async function overrideTask(
  userId: string,
  taskId: string,
  updates: {
    title?: string;
    description?: string;
    acceptanceCriteria?: string;
    assignedAgentId?: string;
    priority?: string;
  },
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  // If task is running, cancel current execution gracefully
  if (task.status === 'RUNNING') {
    await prisma.taskExecution.updateMany({
      where: { taskId, status: 'RUNNING' },
      data: { status: 'CANCELLED', completedAt: new Date(), errorMessage: 'Overridden by human operator' },
    });
    // Signal the agent to stop via Redis
    if (task.assignedAgentId) {
      await redis.set(`agent-hub:stop:${task.assignedAgentId}`, '1', 'EX', 60);
    }
  }

  // Apply updates and re-queue
  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...updates,
      status: 'QUEUED',
      retryCount: 0,
    } as any,
  });

  // Re-enqueue
  await taskQueue.add('task-execution', { taskId }, { jobId: `override-${taskId}-${Date.now()}` });

  await publishEvent('task:status_changed', { taskId, projectId: task.projectId, status: 'queued', agentId: updates.assignedAgentId ?? task.assignedAgentId });

  await audit(userId, 'intervention.override_task', 'Task', taskId, { updates });
}

// ── 3. Take over / release a department ──────────────────────────────────────

export async function pauseDepartment(userId: string, projectId: string, department: string): Promise<number> {
  // Find all agents in this department and set them to 'disabled' temporarily
  const agents = await prisma.agentRegistration.findMany({
    where: { userId, department },
  });

  for (const agent of agents) {
    await prisma.agentRegistration.update({
      where: { id: agent.id },
      data: { status: 'DISABLED' },
    });
    await redis.set(`agent-hub:stop:${agent.id}`, '1', 'EX', 7200); // 2hr stop signal
  }

  // Pause queued tasks for this department's agents
  const agentIds = agents.map((a) => a.id);
  await prisma.task.updateMany({
    where: { projectId, assignedAgentId: { in: agentIds }, status: 'QUEUED' },
    data: { status: 'PENDING' },
  });

  await publishEvent('agent:message', {
    fromAgentId: 'human',
    fromAgentName: '👤 Human Operator',
    toAgentId: null,
    projectId,
    message: `⏸️ Human operator has taken over the **${department}** department. All ${department} agents are paused.`,
    timestamp: new Date().toISOString(),
  });

  await audit(userId, 'intervention.pause_department', 'Department', department, { projectId, agentCount: agents.length });

  return agents.length;
}

export async function resumeDepartment(userId: string, projectId: string, department: string): Promise<number> {
  const agents = await prisma.agentRegistration.findMany({ where: { userId, department } });

  for (const agent of agents) {
    await prisma.agentRegistration.update({ where: { id: agent.id }, data: { status: 'IDLE' } });
    await redis.del(`agent-hub:stop:${agent.id}`);
  }

  // Re-queue pending tasks for this department
  const agentIds = agents.map((a) => a.id);
  const pendingTasks = await prisma.task.findMany({
    where: { projectId, assignedAgentId: { in: agentIds }, status: 'PENDING' },
  });

  for (const task of pendingTasks) {
    await prisma.task.update({ where: { id: task.id }, data: { status: 'QUEUED' } });
    await taskQueue.add('task-execution', { taskId: task.id }, { jobId: `resume-${task.id}` });
  }

  await publishEvent('agent:message', {
    fromAgentId: 'human',
    fromAgentName: '👤 Human Operator',
    toAgentId: null,
    projectId,
    message: `▶️ **${department}** department resumed. ${pendingTasks.length} tasks re-queued.`,
    timestamp: new Date().toISOString(),
  });

  await audit(userId, 'intervention.resume_department', 'Department', department, { projectId, requeued: pendingTasks.length });
  return pendingTasks.length;
}

// ── 4. Inject context into agent memory ──────────────────────────────────────

export async function injectContext(
  userId: string,
  agentId: string,
  projectId: string | null,
  key: string,
  value: unknown,
): Promise<void> {
  const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error('Agent not found');

  await prisma.agentMemory.upsert({
    where: {
      agentId_projectId_scope_key: {
        agentId,
        projectId: projectId ?? (null as any),
        scope: projectId ? 'PROJECT' : 'AGENT_GLOBAL',
        key,
      },
    },
    update: { value: value as any },
    create: {
      agentId,
      projectId,
      scope: projectId ? 'PROJECT' : 'AGENT_GLOBAL',
      key,
      value: value as any,
    },
  });

  await audit(userId, 'intervention.inject_context', 'Agent', agentId, { key, projectId });
}

// ── 5. Redirect task to different agent ───────────────────────────────────────

export async function redirectTask(userId: string, taskId: string, newAgentId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  const newAgent = await prisma.agentRegistration.findFirst({ where: { id: newAgentId, userId } });
  if (!newAgent) throw new Error('Target agent not found');

  // Stop current agent
  if (task.assignedAgentId) {
    await redis.set(`agent-hub:stop:${task.assignedAgentId}`, '1', 'EX', 60);
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { assignedAgentId: newAgentId, status: 'QUEUED', retryCount: 0 },
  });

  await taskQueue.add('task-execution', { taskId }, { jobId: `redirect-${taskId}-${Date.now()}` });
  await publishEvent('task:status_changed', { taskId, projectId: task.projectId, status: 'queued', agentId: newAgentId });
  await audit(userId, 'intervention.redirect_task', 'Task', taskId, { fromAgent: task.assignedAgentId, toAgent: newAgentId });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function audit(userId: string, action: string, resourceType: string, resourceId: string, metadata: unknown) {
  await prisma.auditLog.create({ data: { userId, action, resourceType, resourceId, metadata: metadata as any } });
}

// ── Expose pending human messages for agent-runner ────────────────────────────
// Called by agent-runner before each LLM turn to check for human input

export async function popHumanMessages(agentId: string): Promise<string[]> {
  const msgs: string[] = [];
  let item: string | null;
  while ((item = await redis.rpop(humanMsgKey(agentId))) !== null) {
    try {
      const parsed = JSON.parse(item);
      msgs.push(parsed.message);
    } catch {}
  }
  return msgs;
}

export async function shouldAgentStop(agentId: string): Promise<boolean> {
  const val = await redis.get(`agent-hub:stop:${agentId}`);
  if (val) await redis.del(`agent-hub:stop:${agentId}`);
  return val === '1';
}
