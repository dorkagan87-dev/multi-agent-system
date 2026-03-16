import { prisma } from '../config/database';
import { getProvider, ProviderKey } from '../modules/agents/providers/registry';
import { decryptApiKey } from '../modules/agents/agents.service';
import { publishEvent } from '../modules/events/events.service';
import { popHumanMessages, shouldAgentStop } from '../modules/company/intervention.service';
import type { ExecutionContext, Message, ToolCall } from '../modules/agents/providers/provider.interface';
import type { AgentProvider, AgentStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { autoPostTaskCompletion } from '../modules/network/social.service';
import { taskQueue } from '../modules/tasks/tasks.queue';

// Errors that should never be retried (billing, auth, not transient)
const FATAL_ERROR_PATTERNS = [
  'credit balance is too low',
  'insufficient_quota',
  'invalid_api_key',
  'authentication',
  'API key',
  'billing',
  'quota exceeded',
  'account is not active',
];

export async function runAgentOnTask(taskId: string): Promise<void> {
  // Load task + project
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      executions: { orderBy: { attempt: 'desc' }, take: 1 },
    },
  });
  if (!task) throw new Error(`Task ${taskId} not found`);

  // Auto-assign agent if not assigned
  let agentId = task.assignedAgentId;
  if (!agentId) {
    agentId = await autoAssignAgent(task.project.id, task.id);
  }
  if (!agentId) throw new Error(`No eligible agent found for task ${taskId}`);

  const agent = await prisma.agentRegistration.findUnique({
    where: { id: agentId },
    include: { toolGrants: { include: { tool: true } } },
  });
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const attempt = (task.executions[0]?.attempt ?? 0) + 1;

  // Create execution record
  const execution = await prisma.taskExecution.create({
    data: {
      taskId,
      agentId,
      attempt,
      status: 'RUNNING',
    },
  });

  // Mark task + agent as running
  await prisma.task.update({ where: { id: taskId }, data: { status: 'RUNNING', startedAt: new Date(), assignedAgentId: agentId } });
  await prisma.agentRegistration.update({
    where: { id: agentId },
    data: { status: 'BUSY', currentTaskCount: { increment: 1 } },
  });

  await publishEvent('task:status_changed', {
    taskId, projectId: task.projectId, status: 'running', agentId,
  });

  const apiKey = decryptApiKey(agent);
  const providerKey = agent.provider.toLowerCase() as ProviderKey;
  const provider = getProvider(providerKey);

  // Build tool definitions for this agent
  const toolDefs = agent.toolGrants.map((g) => ({
    name: g.tool.name,
    description: g.tool.description,
    inputSchema: g.tool.inputSchema as Record<string, unknown>,
  }));

  // Load relevant memories using keyword search on task title + description
  const memoryContext = await buildMemoryContext(agentId!, task);

  const initialMessages: Message[] = [
    {
      role: 'user',
      content: `## Task: ${task.title}\n\n${task.description}${task.acceptanceCriteria ? `\n\n## Acceptance Criteria\n${task.acceptanceCriteria}` : ''}${memoryContext}`,
    },
  ];

  const ctx: ExecutionContext = {
    taskId,
    executionId: execution.id,
    messages: initialMessages,
    tools: toolDefs,
    maxTurns: agent.maxTurns,
    onTurn: async (turn) => {
      // Check for human stop signal
      if (await shouldAgentStop(agentId)) {
        throw new Error('Stopped by human operator');
      }

      // Inject any pending human messages into the conversation
      const humanMsgs = await popHumanMessages(agentId);
      if (humanMsgs.length > 0) {
        ctx.messages.push(...humanMsgs.map((m) => ({ role: 'user' as const, content: `[Human operator]: ${m}` })));
        await prisma.executionLog.create({
          data: { executionId: execution.id, level: 'info', message: `Human operator injected ${humanMsgs.length} message(s)`, data: { messages: humanMsgs } },
        });
      }

      const logEntry = await prisma.executionLog.create({
        data: {
          executionId: execution.id,
          level: 'llm_turn',
          message: turn.content.slice(0, 500) || '(tool use)',
          data: {
            toolCalls: turn.toolCalls,
            finishReason: turn.finishReason,
          } as any,
        },
      });
      await publishEvent('task:log_appended', { executionId: execution.id, log: logEntry });

      // Agent-to-agent broadcast: emit message to office room
      if (turn.content) {
        await prisma.agentMessage.create({
          data: { fromAgentId: agentId!, projectId: task.projectId, content: turn.content.slice(0, 2000) },
        });
        await publishEvent('agent:message', {
          fromAgentId: agentId!,
          fromAgentName: agent.name,
          toAgentId: null,
          projectId: task.projectId,
          message: turn.content.slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      }

      // Update execution turn count
      await prisma.taskExecution.update({
        where: { id: execution.id },
        data: { turns: { increment: 1 } },
      });
    },
    onToolCall: async (call: ToolCall) => {
      await prisma.executionLog.create({
        data: {
          executionId: execution.id,
          level: 'tool_call',
          message: `Calling tool: ${call.name}`,
          data: { input: call.input } as any,
        },
      });

      const toolResult = await dispatchTool(call, agent.toolGrants, agentId!, task.projectId);

      await prisma.executionLog.create({
        data: {
          executionId: execution.id,
          level: 'tool_result',
          message: toolResult.content.slice(0, 500),
          data: { toolCallId: call.id, isError: toolResult.isError },
        },
      });

      return toolResult;
    },
  };

  try {
    const result = await provider.run(
      {
        modelId: agent.modelId,
        apiKey,
        systemPrompt: agent.systemPrompt ?? undefined,
        temperature: agent.temperature,
        maxTokensPerTurn: agent.maxTokensPerTurn,
      },
      ctx,
    );

    // Update execution
    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: {
        status: 'COMPLETED',
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalCost: result.cost,
        turns: result.turns,
        completedAt: new Date(),
      },
    });

    // Update task
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        outputSummary: result.finalOutput.slice(0, 2000),
        output: { finalOutput: result.finalOutput, cost: result.cost, turns: result.turns },
      },
    });

    // Update agent token usage
    await prisma.agentRegistration.update({
      where: { id: agentId },
      data: {
        status: 'IDLE',
        currentTaskCount: { decrement: 1 },
        tokensUsedToday: { increment: result.promptTokens + result.completionTokens },
      },
    });

    await publishEvent('task:status_changed', { taskId, projectId: task.projectId, status: 'completed', agentId });
    await publishEvent('agent:status_changed', { agentId, status: 'idle' });
    await publishEvent('agent:token_usage', { agentId, promptTokens: result.promptTokens, completionTokens: result.completionTokens, cost: result.cost });

    // Auto-post to Moltbook network (fire-and-forget)
    autoPostTaskCompletion(agentId, task.title, result.finalOutput, task.project.name);

    // Auto-extract memories from task output (fire-and-forget, only for Anthropic agents)
    if (agent.provider === 'ANTHROPIC') {
      extractAndStoreMemories(agentId!, task.projectId, task.title, result.finalOutput, apiKey, agent.modelId, agent.provider).catch(() => {});
    }

    // Check project completion
    await checkProjectCompletion(task.projectId);

  } catch (err: any) {
    logger.error({ err, taskId, agentId }, 'Agent execution failed');

    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage: err.message },
    });

    const isFatalError = FATAL_ERROR_PATTERNS.some((p) =>
      err.message?.toLowerCase().includes(p.toLowerCase())
    );

    const newRetryCount = task.retryCount + 1;
    const shouldRetry = !isFatalError && newRetryCount < task.maxRetries;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: shouldRetry ? 'QUEUED' : 'FAILED',
        retryCount: newRetryCount,
      },
    });

    await prisma.agentRegistration.update({
      where: { id: agentId },
      data: { status: 'IDLE', currentTaskCount: { decrement: 1 } },
    });

    await publishEvent('task:status_changed', { taskId, projectId: task.projectId, status: shouldRetry ? 'queued' : 'failed', agentId });

    if (isFatalError) {
      logger.warn({ taskId, agentId, err: err.message }, 'Fatal error — task marked FAILED, no retry');
      return; // don't re-queue, don't throw
    }

    if (shouldRetry) {
      // Re-add to BullMQ with exponential backoff so the worker actually picks it up
      const delayMs = Math.min(5000 * Math.pow(2, newRetryCount - 1), 60_000);
      await taskQueue.add('task-execution', { taskId }, { delay: delayMs });
      logger.info({ taskId, attempt: newRetryCount, delayMs }, 'Task re-queued for retry');
    } else {
      throw err; // Let BullMQ handle final failure
    }
  }
}

async function autoAssignAgent(projectId: string, taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  // Find eligible agents: IDLE and below their own concurrency limit
  const idleAgents = await prisma.agentRegistration.findMany({
    where: { status: 'IDLE' },
    orderBy: { currentTaskCount: 'asc' },
  });

  const eligible = idleAgents.filter((a) => a.currentTaskCount < a.maxConcurrentTasks);
  return eligible[0]?.id ?? null;
}

async function dispatchTool(call: ToolCall, grants: any[], agentId: string, projectId: string) {
  const grant = grants.find((g) => g.tool.name === call.name);
  if (!grant) {
    return { toolCallId: call.id, content: `Error: tool "${call.name}" not granted to this agent`, isError: true };
  }

  try {
    const { executeTool } = await import('../modules/tools/tool.dispatcher');
    const result = await executeTool(call.name, call.input, { agentId, projectId });
    return { toolCallId: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) };
  } catch (err: any) {
    return { toolCallId: call.id, content: `Tool error: ${err.message}`, isError: true };
  }
}

// ── Smart memory loading ──────────────────────────────────────────────────────

async function buildMemoryContext(agentId: string, task: { title: string; description: string | null; projectId: string }): Promise<string> {
  // Extract meaningful keywords from task title + description
  const searchText = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const words = searchText
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !STOP_WORDS.has(w))
    .slice(0, 6);

  let memories;

  if (words.length > 0) {
    const wordFilters = words.flatMap((w) => [
      { key: { contains: w, mode: 'insensitive' as const } },
      { content: { contains: w, mode: 'insensitive' as const } },
    ]);
    memories = await prisma.agentMemory.findMany({
      where: {
        agentId,
        OR: [{ scope: 'AGENT_GLOBAL' }, { scope: 'PROJECT', projectId: task.projectId }],
        AND: [{ OR: wordFilters }],
        expiresAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });
  }

  // Fall back to most recent if relevance search found nothing
  if (!memories || memories.length === 0) {
    memories = await prisma.agentMemory.findMany({
      where: {
        agentId,
        OR: [{ scope: 'AGENT_GLOBAL' }, { scope: 'PROJECT', projectId: task.projectId }],
        expiresAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
  }

  if (memories.length === 0) return '';

  const lines = memories.map((m) => {
    const text = m.content ?? JSON.stringify(m.value);
    return `- **${m.key}**: ${text.slice(0, 400)}`;
  });

  return `\n\n## Your Memory (relevant to this task)\n${lines.join('\n')}`;
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'been', 'they', 'were', 'what',
  'when', 'which', 'their', 'there', 'then', 'than', 'about', 'into', 'more',
  'also', 'some', 'such', 'each', 'make', 'like', 'time', 'just', 'know', 'take',
]);

// ── Auto memory extraction ────────────────────────────────────────────────────

export async function extractAndStoreMemories(
  agentId: string,
  projectId: string,
  taskTitle: string,
  finalOutput: string,
  apiKey: string,
  modelId: string,
  provider: string,
): Promise<void> {
  if (finalOutput.length < 300) return; // Not enough content to extract from

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Use a cheap model for extraction if available, otherwise use the agent's model
    const extractionModel = provider === 'ANTHROPIC' ? 'claude-haiku-4-5-20251001' : modelId;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: extractionModel,
      max_tokens: 512,
      system: `You extract key learnings from AI agent task outputs as concise memory entries.
Output ONLY a JSON array of objects: [{"key": "short_snake_case_key", "content": "1-2 sentence fact", "tags": ["tag1"]}]
Extract 2-4 entries maximum. Focus on facts, decisions, and findings that would be useful in future tasks.
Keys must be lowercase snake_case. Content must be specific and actionable. No commentary outside JSON.`,
      messages: [{
        role: 'user',
        content: `Task: "${taskTitle}"\n\nOutput summary:\n${finalOutput.slice(0, 2000)}`,
      }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;

    const entries: Array<{ key: string; content: string; tags?: string[] }> = JSON.parse(match[0]);

    for (const entry of entries.slice(0, 4)) {
      if (!entry.key || !entry.content) continue;
      await prisma.agentMemory.upsert({
        where: {
          agentId_projectId_scope_key: {
            agentId,
            projectId,
            scope: 'PROJECT',
            key: entry.key,
          },
        },
        create: {
          agentId,
          projectId,
          scope: 'PROJECT',
          key: entry.key,
          value: { summary: entry.content.slice(0, 200) },
          content: entry.content,
          tags: entry.tags ?? [],
          source: 'auto_extract',
        },
        update: {
          value: { summary: entry.content.slice(0, 200) },
          content: entry.content,
          tags: entry.tags ?? [],
          source: 'auto_extract',
        },
      });
    }

    logger.info({ agentId, projectId, count: entries.length }, 'Auto-extracted memories from task');
  } catch (err: any) {
    logger.warn({ err: err.message, agentId }, 'Memory extraction failed (non-fatal)');
  }
}

async function checkProjectCompletion(projectId: string) {
  const [total, completed] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: 'COMPLETED' } }),
  ]);

  await publishEvent('project:progress', { projectId, completedTasks: completed, totalTasks: total });

  if (total > 0 && total === completed) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
