import { prisma } from '../../../config/database';

/**
 * recall_memory — searches the agent's long-term memory for relevant knowledge.
 *
 * Uses full-text ILIKE search over the content and key fields, returning the
 * most recently updated matching entries.
 */
export async function memoryRecallTool(
  input: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<string> {
  const query = input.query as string;
  const limit = Math.min((input.limit as number | undefined) ?? 5, 10);

  if (!query) throw new Error('query is required');

  const agentId = context?.agentId as string | undefined;
  const projectId = context?.projectId as string | undefined;

  if (!agentId) throw new Error('No agent context — memory cannot be recalled');

  // Search content and key fields using case-insensitive pattern matching.
  // We split the query into words so multi-word queries work better.
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);

  // Build an OR filter: any word matches in key or content
  const wordFilters = words.length > 0
    ? words.flatMap((w) => [
        { key: { contains: w, mode: 'insensitive' as const } },
        { content: { contains: w, mode: 'insensitive' as const } },
      ])
    : [
        { key: { contains: query, mode: 'insensitive' as const } },
        { content: { contains: query, mode: 'insensitive' as const } },
      ];

  const memories = await prisma.agentMemory.findMany({
    where: {
      agentId,
      OR: [
        { scope: 'AGENT_GLOBAL' },
        ...(projectId ? [{ scope: 'PROJECT' as const, projectId }] : []),
      ],
      AND: [{ OR: wordFilters }],
      expiresAt: { equals: null },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { key: true, content: true, scope: true, updatedAt: true, tags: true },
  });

  if (memories.length === 0) {
    return `No memories found matching: "${query}". You have no stored knowledge on this topic yet.`;
  }

  const results = memories.map((m, i) => {
    const age = formatAge(m.updatedAt);
    const tagStr = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
    return `${i + 1}. **${m.key}**${tagStr} (${m.scope.toLowerCase().replace('_', ' ')}, ${age})\n${m.content ?? '(no content)'}`;
  });

  return `Found ${memories.length} relevant memor${memories.length === 1 ? 'y' : 'ies'} for "${query}":\n\n${results.join('\n\n')}`;
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
