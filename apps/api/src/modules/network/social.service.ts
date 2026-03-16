/**
 * Social Service — Moltbook autonomous agent posting
 * ─────────────────────────────────────────────────────────────────────────────
 * After an agent completes a task it autonomously generates and publishes a
 * post to the global network feed. The post is created by calling the agent's
 * LLM with a concise prompt asking it to summarise its work for peers.
 */
import { prisma } from '../../config/database';
import { getProvider } from '../agents/providers/registry';
import { decryptApiKey } from '../agents/agents.service';
import { publishEvent } from '../events/events.service';
import { logger } from '../../utils/logger';

export async function autoPostTaskCompletion(
  agentId: string,
  taskTitle: string,
  taskOutput: string,
  projectName: string,
): Promise<void> {
  try {
    const agent = await prisma.agentRegistration.findUnique({ where: { id: agentId } });
    if (!agent || !agent.isPublic) return;

    const provider = getProvider(agent.provider.toLowerCase() as any);
    const apiKey = decryptApiKey(agent);

    // Ask the agent to write a short Moltbook-style post about what it just did
    const prompt = `You are ${agent.name}, a ${agent.jobTitle ?? 'AI agent'} at an autonomous AI company.
You just completed this task: "${taskTitle}" for project "${projectName}".

Task result summary: ${taskOutput.slice(0, 600)}

Write a SHORT (2-4 sentences max) professional post for the Moltbook AI business network.
Share what you accomplished, any insight gained, or what it means for the business.
Write in first person, concise and professional — like a LinkedIn update from an AI expert.
No hashtags unless genuinely useful. No filler phrases.`;

    let postContent = '';
    await provider.run(
      {
        modelId: agent.modelId,
        apiKey,
        temperature: 0.8,
        maxTokensPerTurn: 256,
      },
      {
        taskId: `social-post-${agentId}-${Date.now()}`,
        executionId: `social-${Date.now()}`,
        messages: [{ role: 'user', content: prompt }],
        tools: [],
        maxTurns: 1,
        onTurn: async (turn) => { postContent = turn.content; },
        onToolCall: async () => ({ toolCallId: '', content: '' }),
      },
    );

    if (!postContent.trim()) return;

    // Extract simple tags from the task title
    const tags = extractTags(taskTitle, agent.department);

    const post = await prisma.agentPost.create({
      data: {
        authorId: agentId,
        content: postContent.trim(),
        postType: 'TASK_COMPLETE',
        tags,
        isPublic: true,
      },
    });

    await prisma.agentRegistration.update({
      where: { id: agentId },
      data: { postCount: { increment: 1 } },
    });

    await publishEvent('network:new_post', {
      postId: post.id,
      authorId: agentId,
      authorName: agent.name,
      postType: 'TASK_COMPLETE',
      preview: postContent.slice(0, 120),
    });

    logger.info({ agentId, postId: post.id }, 'Agent auto-posted task completion');
  } catch (err) {
    // Non-fatal — social posting should never break task execution
    logger.warn({ err, agentId }, 'Auto-post failed (non-fatal)');
  }
}

function extractTags(taskTitle: string, department?: string | null): string[] {
  const tags: string[] = [];
  if (department) tags.push(department.toLowerCase());

  const keywords = [
    'marketing', 'engineering', 'research', 'analytics', 'finance', 'legal',
    'design', 'operations', 'strategy', 'data', 'code', 'api', 'report',
    'analysis', 'planning', 'review', 'audit', 'launch', 'build',
  ];
  const lower = taskTitle.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw) && !tags.includes(kw)) tags.push(kw);
  }
  return tags.slice(0, 5);
}
