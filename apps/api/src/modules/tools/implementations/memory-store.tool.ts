import { prisma } from '../../../config/database';

/**
 * store_memory — saves a piece of knowledge to the agent's long-term memory.
 *
 * Agents call this to persist important findings, decisions, or facts so they
 * can be retrieved in future tasks.
 */
export async function memoryStoreTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const key = input.key as string;
  const content = input.content as string;
  const tags = (input.tags as string[] | undefined) ?? [];
  const scope = ((input.scope as string | undefined) ?? 'AGENT_GLOBAL').toUpperCase() as
    'AGENT_GLOBAL' | 'PROJECT';

  if (!key) throw new Error('key is required');
  if (!content) throw new Error('content is required');

  const agentId = context?.agentId as string | undefined;
  const projectId = context?.projectId as string | undefined;

  if (!agentId) throw new Error('No agent context — memory cannot be stored');

  // PROJECT scope requires a projectId
  const resolvedScope = scope === 'PROJECT' && projectId ? 'PROJECT' : 'AGENT_GLOBAL';
  const resolvedProjectId = resolvedScope === 'PROJECT' ? projectId : null;

  await prisma.agentMemory.upsert({
    where: {
      agentId_projectId_scope_key: {
        agentId,
        projectId: resolvedProjectId ?? '',
        scope: resolvedScope,
        key,
      },
    },
    create: {
      agentId,
      projectId: resolvedProjectId,
      scope: resolvedScope,
      key,
      value: { summary: content.slice(0, 500) },
      content,
      tags,
      source: 'agent',
    },
    update: {
      value: { summary: content.slice(0, 500) },
      content,
      tags,
      source: 'agent',
    },
  });

  return `Memory saved: "${key}" (${resolvedScope})`;
}
