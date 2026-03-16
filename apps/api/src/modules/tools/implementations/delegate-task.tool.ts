import { prisma } from '../../../config/database';
import { taskQueue } from '../../tasks/tasks.queue';
import { publishEvent } from '../../events/events.service';

/**
 * delegate_task — spawn a sub-task assigned to another agent (or auto-assign).
 *
 * The calling agent provides a title, description, and optionally a target agentId.
 * A new Task is created in the same project and immediately queued.
 * The agent can use check_delegated_task(taskId) to poll for the result.
 */
export async function delegateTaskTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const title = input.title as string;
  const description = input.description as string;
  const targetAgentId = input.agentId as string | undefined;
  const acceptanceCriteria = input.acceptanceCriteria as string | undefined;
  const priority = ((input.priority as string | undefined) ?? 'MEDIUM').toUpperCase();

  if (!title) throw new Error('title is required');
  if (!description) throw new Error('description is required');

  const agentId = context?.agentId as string | undefined;
  const projectId = context?.projectId as string | undefined;
  if (!projectId) throw new Error('No project context — delegate_task requires a project');

  // Validate target agent if specified
  if (targetAgentId) {
    const targetAgent = await prisma.agentRegistration.findUnique({ where: { id: targetAgentId } });
    if (!targetAgent) throw new Error(`Target agent "${targetAgentId}" not found`);
  }

  // Create the delegated task
  const task = await prisma.task.create({
    data: {
      projectId,
      title: `[Delegated] ${title}`,
      description: `${description}\n\n_Delegated by agent ${agentId ?? 'unknown'}_`,
      acceptanceCriteria,
      priority: priority as any,
      status: 'QUEUED',
      assignedAgentId: targetAgentId ?? null,
      maxRetries: 2,
    },
  });

  // Enqueue immediately
  const job = await taskQueue.add('task-execution', { taskId: task.id });
  await prisma.task.update({ where: { id: task.id }, data: { queueJobId: job.id?.toString() } });

  await publishEvent('task:status_changed', {
    taskId: task.id,
    projectId,
    status: 'queued',
    agentId: targetAgentId ?? null,
    delegatedBy: agentId,
  });

  return `Delegated task created (ID: ${task.id}). It has been queued${targetAgentId ? ` and assigned to agent ${targetAgentId}` : ' for auto-assignment'}. Call check_delegated_task with taskId="${task.id}" to get the result when ready.`;
}

/**
 * check_delegated_task — poll for the result of a previously delegated task.
 */
export async function checkDelegatedTaskTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const taskId = input.taskId as string;
  if (!taskId) throw new Error('taskId is required');

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, outputSummary: true, assignedAgentId: true },
  });

  if (!task) return `No task found with ID "${taskId}".`;

  switch (task.status) {
    case 'COMPLETED':
      return `Task completed. Summary: ${task.outputSummary ?? '(no summary)'}`;
    case 'FAILED':
      return `Task failed. You may want to retry or handle the failure manually.`;
    case 'RUNNING':
      return `Task is currently running. Check back in a moment.`;
    case 'QUEUED':
      return `Task is queued and waiting to be picked up by an agent.`;
    case 'PENDING':
      return `Task is pending — waiting to be queued.`;
    case 'CANCELLED':
      return `Task was cancelled.`;
    default:
      return `Task status: ${task.status}.`;
  }
}
