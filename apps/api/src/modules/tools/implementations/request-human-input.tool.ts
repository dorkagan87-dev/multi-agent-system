import { prisma } from '../../../config/database';
import { publishEvent } from '../../events/events.service';

/**
 * request_human_input — agent pauses to ask a human operator a question.
 *
 * The agent calls this tool when it hits ambiguity or needs a decision.
 * The question is stored in AgentMemory with scope AGENT_GLOBAL and a special
 * key prefix. The human replies via the intervention panel, and the answer is
 * stored back. The agent should call check_human_reply(questionId) to get it.
 */
export async function requestHumanInputTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const question = input.question as string;
  const urgency = ((input.urgency as string | undefined) ?? 'medium').toLowerCase();

  if (!question) throw new Error('question is required');

  const agentId = context?.agentId as string | undefined;
  const projectId = context?.projectId as string | undefined;
  if (!agentId) throw new Error('No agent context');

  const questionId = `hitl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Store the pending question as a memory entry
  await prisma.agentMemory.create({
    data: {
      agentId,
      projectId,
      scope: projectId ? 'PROJECT' : 'AGENT_GLOBAL',
      key: questionId,
      value: { type: 'human_question', status: 'pending', question, urgency },
      content: question,
      tags: ['hitl', 'pending', urgency],
      source: 'agent',
    },
  });

  // Broadcast so the UI can show a notification
  await publishEvent('hitl:question', {
    questionId,
    agentId,
    projectId,
    question,
    urgency,
    timestamp: new Date().toISOString(),
  });

  return `Question submitted (ID: ${questionId}). The human operator has been notified. Call check_human_reply with questionId="${questionId}" to retrieve the answer when ready.`;
}

/**
 * check_human_reply — poll for a human answer to a previously submitted question.
 */
export async function checkHumanReplyTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const questionId = input.questionId as string;
  if (!questionId) throw new Error('questionId is required');

  const agentId = context?.agentId as string | undefined;
  if (!agentId) throw new Error('No agent context');

  const memory = await prisma.agentMemory.findFirst({
    where: { agentId, key: questionId },
  });

  if (!memory) return `No question found with ID "${questionId}".`;

  const val = memory.value as Record<string, unknown>;

  if (val.status === 'answered') {
    return `Answer received: ${val.answer}`;
  }

  return `Still waiting for human reply. Question: "${val.question}". Check back later or proceed with your best judgment.`;
}
