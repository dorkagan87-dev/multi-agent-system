/**
 * Sector Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies a sector configuration to a user's company:
 *   1. Stores sector preference in User metadata (AgentMemory with scope AGENT_GLOBAL)
 *   2. Creates the recommended agent roster (skips agents the user already has)
 *   3. Seeds tools and grants them to agents as configured
 *   4. Returns the CEO system prompt tuned for the sector
 *   5. Exposes CEO Idea Generator — zero-input autonomous brainstorming
 */
import { prisma } from '../../config/database';
import { getSectorConfig, listSectors, Sector } from './sector.config';
import { encrypt } from '../../utils/crypto';
import { getProvider } from '../agents/providers/registry';
import { publishEvent } from '../events/events.service';
import { logger } from '../../utils/logger';
import type { AgentProvider } from '@prisma/client';

const SECTOR_MEMORY_KEY = 'company_sector';

// ── Get/Set sector for a user ─────────────────────────────────────────────────

export async function getUserSector(userId: string): Promise<Sector | null> {
  const log = await prisma.auditLog.findFirst({
    where: { userId, action: 'company.sector_set' },
    orderBy: { timestamp: 'desc' },
  });
  return log ? (log.metadata as any)?.sector ?? null : null;
}

export async function setUserSector(userId: string, sector: Sector) {
  await prisma.auditLog.create({
    data: { userId, action: 'company.sector_set', resourceType: 'User', resourceId: userId, metadata: { sector } },
  });
}

// ── Apply sector — create agent roster, grant tools ───────────────────────────

export async function applySector(userId: string, sector: Sector, providerApiKeys: Record<string, string>) {
  const config = getSectorConfig(sector);
  const createdAgents: string[] = [];
  const skippedAgents: string[] = [];

  // Get existing agent names to avoid duplicates
  const existing = await prisma.agentRegistration.findMany({ where: { userId }, select: { name: true } });
  const existingNames = new Set(existing.map((a) => a.name.toLowerCase()));

  // Ensure built-in tools exist in DB
  await ensureBuiltInTools();

  // ── Create or update dedicated CEO agent for this sector ─────────────────────
  const ceoName = `${config.label} CEO`;
  // Prefer openai if provided (avoids empty-credit anthropic), then anthropic, then google
  const ceoApiKey =
    providerApiKeys['openai'] ??
    providerApiKeys['anthropic'] ??
    providerApiKeys['google'];

  const ceoProvider = providerApiKeys['openai'] ? 'openai'
    : providerApiKeys['anthropic'] ? 'anthropic'
    : 'google';

  const ceoModel = ceoProvider === 'openai' ? 'gpt-4o'
    : ceoProvider === 'anthropic' ? 'claude-sonnet-4-6'
    : 'gemini-1.5-pro';

  if (ceoApiKey) {
    try {
      const provider = getProvider(ceoProvider);
      const valid = await provider.validateCredentials(ceoApiKey);
      if (valid) {
        const { encrypted, iv } = encrypt(ceoApiKey);
        const existingCeo = await prisma.agentRegistration.findFirst({
          where: { userId, name: ceoName },
        });
        let ceoAgent;
        if (existingCeo) {
          // Update API key and model if already exists
          ceoAgent = await prisma.agentRegistration.update({
            where: { id: existingCeo.id },
            data: {
              provider: ceoProvider.toUpperCase() as AgentProvider,
              modelId: ceoModel,
              encryptedApiKey: encrypted,
              apiKeyIv: iv,
              systemPrompt: config.ceoSystemPrompt,
              status: 'IDLE',
            },
          });
          createdAgents.push(`${ceoName} (updated)`);
        } else {
          ceoAgent = await prisma.agentRegistration.create({
            data: {
              userId,
              name: ceoName,
              jobTitle: 'Chief Executive Officer',
              department: 'Executive',
              provider: ceoProvider.toUpperCase() as AgentProvider,
              modelId: ceoModel,
              encryptedApiKey: encrypted,
              apiKeyIv: iv,
              systemPrompt: config.ceoSystemPrompt,
              temperature: 0.3,
              maxTokensPerTurn: 8192,
              maxTurns: 5,
            },
          });
          createdAgents.push(ceoName);
          existingNames.add(ceoName.toLowerCase());
        }
        // Grant all allowed tools to CEO
        const ceoTools = await prisma.tool.findMany({ where: { name: { in: [...config.allowedTools, 'request_hire'] } } });
        for (const tool of ceoTools) {
          await prisma.agentToolGrant.upsert({
            where: { agentId_toolId: { agentId: ceoAgent.id, toolId: tool.id } },
            update: {},
            create: { agentId: ceoAgent.id, toolId: tool.id },
          });
        }
        logger.info({ agentId: ceoAgent.id, sector, provider: ceoProvider }, 'CEO agent configured');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to configure CEO agent');
    }
  }

  for (const template of config.agents) {
    if (existingNames.has(template.name.toLowerCase())) {
      skippedAgents.push(template.name);
      continue;
    }

    const apiKey = providerApiKeys[template.preferredProvider]
      ?? providerApiKeys['anthropic']
      ?? providerApiKeys['openai']
      ?? providerApiKeys['google'];

    if (!apiKey) {
      logger.warn({ template: template.name }, 'No API key for provider, skipping agent');
      continue;
    }

    // Validate credentials
    try {
      const provider = getProvider(template.preferredProvider);
      const valid = await provider.validateCredentials(apiKey);
      if (!valid) { logger.warn({ provider: template.preferredProvider }, 'Invalid API key'); continue; }
    } catch {
      continue;
    }

    const { encrypted, iv } = encrypt(apiKey);

    const agent = await prisma.agentRegistration.create({
      data: {
        userId,
        name: template.name,
        jobTitle: template.jobTitle,
        department: template.department,
        provider: template.preferredProvider.toUpperCase() as AgentProvider,
        modelId: template.preferredModel,
        encryptedApiKey: encrypted,
        apiKeyIv: iv,
        systemPrompt: template.systemPrompt,
        avatarUrl: undefined,
        temperature: 0.7,
        maxTokensPerTurn: 4096,
        maxTurns: 20,
        capabilities: { create: template.capabilities.map((c) => ({ name: c })) },
      },
    });

    // Grant configured tools
    const tools = await prisma.tool.findMany({ where: { name: { in: template.tools } } });
    for (const tool of tools) {
      await prisma.agentToolGrant.upsert({
        where: { agentId_toolId: { agentId: agent.id, toolId: tool.id } },
        update: {},
        create: { agentId: agent.id, toolId: tool.id },
      });
    }

    // Also grant request_hire tool to all agents (so they can autonomously request help)
    const hireTool = await prisma.tool.findFirst({ where: { name: 'request_hire' } });
    if (hireTool) {
      await prisma.agentToolGrant.upsert({
        where: { agentId_toolId: { agentId: agent.id, toolId: hireTool.id } },
        update: {},
        create: { agentId: agent.id, toolId: hireTool.id },
      });
    }

    createdAgents.push(template.name);
  }

  await setUserSector(userId, sector);

  return {
    sector: config.label,
    created: createdAgents,
    skipped: skippedAgents,
    departments: config.departments,
    compliance: config.compliance,
    securityLevel: config.securityLevel,
  };
}

// ── CEO Idea Generator — zero human input brainstorming ───────────────────────
/**
 * The user presses "Generate Ideas" (or provides an optional seed topic).
 * The CEO agent brainstorms 5-10 concrete, actionable project ideas for the company
 * based on the sector, current agent roster, and any seed input.
 *
 * Ideas are returned as ready-to-create project drafts with:
 *   - Title, goal, estimated complexity, expected business impact
 *   - Pre-filled task breakdown (ready for one-click project creation)
 */
export async function generateCEOIdeas(userId: string, seedTopic?: string): Promise<CEOIdea[]> {
  const sector = await getUserSector(userId);
  const config = sector ? getSectorConfig(sector) : null;

  const ceoAgent = await prisma.agentRegistration.findFirst({
    where: {
      userId,
      status: { not: 'DISABLED' },
      OR: [
        { jobTitle: { contains: 'CEO', mode: 'insensitive' } },
        { jobTitle: { contains: 'Chief', mode: 'insensitive' } },
        { jobTitle: { contains: 'Director', mode: 'insensitive' } },
        { jobTitle: null },
      ],
    },
    orderBy: { maxTokensPerTurn: 'desc' },
  });

  if (!ceoAgent) throw new Error('No active agent available for idea generation');

  const agents = await prisma.agentRegistration.findMany({
    where: { userId, status: { not: 'DISABLED' } },
    include: { capabilities: true },
  });

  const rosterSummary = agents.map((a) =>
    `- ${a.name} (${a.jobTitle ?? 'Agent'}, ${a.department ?? 'General'}): ${a.capabilities.map((c) => c.name).join(', ')}`
  ).join('\n');

  const sectorContext = config
    ? `SECTOR: ${config.label}\nKPIs TO IMPROVE: ${config.kpis.join(', ')}\nCOMPLIANCE: ${config.compliance.join(', ')}`
    : 'SECTOR: General Business';

  const prompt = `You are the CEO of an autonomous AI company. Generate 6 concrete, high-value project ideas for the team.

${sectorContext}

AVAILABLE TEAM:
${rosterSummary}

${seedTopic ? `FOCUS AREA: ${seedTopic}` : 'Generate ideas across different business functions.'}

Respond ONLY with a JSON array of project ideas. No markdown fences, just the raw JSON array:

[
  {
    "title": "string — specific, action-oriented project name",
    "goal": "string — one paragraph describing what success looks like",
    "businessImpact": "string — expected KPI improvement or value created",
    "complexity": "low|medium|high",
    "estimatedDays": number,
    "department": "string — primary department owning this",
    "suggestedTasks": [
      { "title": "string", "description": "string", "department": "string", "priority": "high|medium|low" }
    ]
  }
]

Make ideas specific to this team's capabilities and sector. Be ambitious but realistic.`;

  const { decrypt } = await import('../../utils/crypto');
  const apiKey = decrypt(ceoAgent.encryptedApiKey, ceoAgent.apiKeyIv);
  const provider = getProvider(ceoAgent.provider.toLowerCase() as any);

  let responseText = '';
  await provider.run(
    {
      modelId: ceoAgent.modelId,
      apiKey,
      systemPrompt: config?.ceoSystemPrompt ?? 'You are an experienced CEO. Be specific, strategic, and action-oriented.',
      temperature: 0.85, // higher temp for creative ideation
      maxTokensPerTurn: 16000,
    },
    {
      taskId: `idea-gen-${Date.now()}`,
      executionId: `idea-exec-${Date.now()}`,
      messages: [{ role: 'user', content: prompt }],
      tools: [],
      maxTurns: 1,
      onTurn: async (turn) => { responseText = turn.content; },
      onToolCall: async () => ({ toolCallId: '', content: '' }),
    }
  );

  // Parse JSON from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('CEO did not return valid idea list');

  const ideas: CEOIdea[] = JSON.parse(jsonMatch[0]);

  // Broadcast to company feed
  await publishEvent('agent:message', {
    fromAgentId: ceoAgent.id,
    fromAgentName: ceoAgent.name,
    toAgentId: null,
    projectId: 'global',
    message: `💡 I've generated ${ideas.length} new project ideas${seedTopic ? ` around "${seedTopic}"` : ''}. Check the Idea Board to review and launch them!`,
    timestamp: new Date().toISOString(),
  });

  return ideas;
}

export interface CEOIdea {
  title: string;
  goal: string;
  businessImpact: string;
  complexity: 'low' | 'medium' | 'high';
  estimatedDays: number;
  department: string;
  suggestedTasks: Array<{
    title: string;
    description: string;
    department: string;
    priority: string;
  }>;
}

// ── Inject sector context into CEO orchestrator prompt ────────────────────────

export function buildSectorAwareCEOPrompt(basePrompt: string, sector: Sector | null): string {
  if (!sector) return basePrompt;
  const config = getSectorConfig(sector);
  return `${config.ceoSystemPrompt}\n\n${basePrompt}\n\nSECTOR PLANNING REQUIREMENTS:\n${config.taskPlanningHints}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureBuiltInTools() {
  const tools = [
    { name: 'web_search', displayName: 'Web Search', type: 'WEB_SEARCH' as const, description: 'Search the web.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, requiresSandbox: false },
    { name: 'code_execution', displayName: 'Code Execution', type: 'CODE_EXECUTION' as const, description: 'Execute Python or JavaScript.', inputSchema: { type: 'object', properties: { language: { type: 'string' }, code: { type: 'string' } }, required: ['language', 'code'] }, requiresSandbox: true },
    { name: 'http_request', displayName: 'HTTP Request', type: 'HTTP_REQUEST' as const, description: 'Make HTTP requests.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, requiresSandbox: false },
    { name: 'request_hire', displayName: 'Request Hire', type: 'CUSTOM' as const, description: 'Request a new specialist agent.', inputSchema: { type: 'object', properties: { role: { type: 'string' }, department: { type: 'string' }, reason: { type: 'string' } }, required: ['role', 'department', 'reason'] }, requiresSandbox: false },
  ];
  for (const t of tools) {
    await prisma.tool.upsert({ where: { name: t.name }, update: {}, create: t });
  }
}
