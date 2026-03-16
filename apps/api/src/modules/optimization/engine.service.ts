/**
 * Optimization Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Takes analyzer output (AgentMetrics[]), calls an LLM to generate specific
 * improvement recommendations, and persists them to the DB.
 *
 * For each agent with issues, the engine crafts a detailed prompt describing
 * the agent's current config + performance problems, then asks the LLM to
 * produce a structured set of changes (prompt rewrites, temperature, maxTurns).
 */
import { prisma } from '../../config/database';
import { getProvider } from '../agents/providers/registry';
import { decryptApiKey } from '../agents/agents.service';
import { analyzeAgents, type AgentMetrics } from './analyzer.service';
import { logger } from '../../utils/logger';

// ── Prompt ───────────────────────────────────────────────────────────────────

const OPTIMIZER_SYSTEM_PROMPT = `You are an AI agent performance optimizer for a business automation hub.
You will be given data about an AI agent's current configuration and its recent performance problems.
Your job is to produce concrete, actionable improvements.

Respond ONLY with a valid JSON array of recommendations, each matching:
{
  "type": "prompt_update" | "temperature" | "max_turns" | "max_tokens",
  "reason": "string — why this change will help",
  "before": { /* current value(s) */ },
  "after": { /* new value(s) */ },
  "impact": "low" | "medium" | "high"
}

Rules:
- For "prompt_update": before.systemPrompt = current, after.systemPrompt = full rewritten prompt
- For "temperature": before.temperature = current float, after.temperature = new float (0.0–1.0)
- For "max_turns": before.maxTurns = current int, after.maxTurns = new int
- For "max_tokens": before.maxTokensPerTurn = current int, after.maxTokensPerTurn = new int
- Only recommend changes that directly address the performance issues listed
- A "prompt_update" should always be included when success rate is low or always_failing
- Be specific in rewrites — don't just say "be clearer", actually rewrite the prompt
- Output must be a JSON array, nothing else`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildOptimizerPrompt(m: AgentMetrics): string {
  const issueList = m.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.type}: ${i.detail}`).join('\n');

  return `AGENT: ${m.agentName}
ROLE: ${m.jobTitle ?? 'Unknown'} / ${m.department ?? 'Unknown'}
PROVIDER: ${m.provider} / ${m.modelId}

CURRENT CONFIG:
  systemPrompt: ${m.systemPrompt ? `"${m.systemPrompt.slice(0, 800)}${m.systemPrompt.length > 800 ? '...' : ''}"` : 'null (no system prompt set)'}
  temperature: ${m.temperature}
  maxTurns: ${m.maxTurns}
  maxTokensPerTurn: ${m.maxTokensPerTurn}

PERFORMANCE (last 14 days, ${m.totalTasks} tasks):
  successRate: ${Math.round(m.successRate * 100)}%
  failureCount: ${m.failureCount}
  retryRate: ${Math.round(m.retryRate * 100)}%
  avgTurns: ${m.avgTurns.toFixed(1)} / ${m.maxTurns} limit
  avgCost: $${m.avgCost.toFixed(4)} per task
  avgTokens: ${Math.round(m.avgTokens)} per task

DETECTED ISSUES:
${issueList}

Generate a JSON array of concrete recommendations to fix these issues.`;
}

// ── Optimizer agent selection ─────────────────────────────────────────────────

async function pickOptimizerAgent(userId: string) {
  // Prefer: anthropic > openai > any provider. Highest model token limit wins.
  const agents = await prisma.agentRegistration.findMany({
    where: { userId, status: { not: 'DISABLED' } },
    orderBy: { maxTokensPerTurn: 'desc' },
  });

  return (
    agents.find((a) => a.provider === 'ANTHROPIC') ??
    agents.find((a) => a.provider === 'OPENAI') ??
    agents[0] ??
    null
  );
}

// ── Core engine ───────────────────────────────────────────────────────────────

export async function runOptimizationEngine(
  userId: string,
  trigger: 'manual' | 'scheduled' | 'threshold' = 'manual',
): Promise<string> {
  // Create the run record
  const run = await prisma.optimizationRun.create({
    data: { userId, trigger, status: 'running' },
  });

  try {
    const metrics = await analyzeAgents(userId);
    const agentsWithIssues = metrics.filter((m) => m.issues.length > 0);

    const optimizer = await pickOptimizerAgent(userId);
    if (!optimizer) {
      await prisma.optimizationRun.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date(), summary: 'No agents available to run optimization analysis.' },
      });
      return run.id;
    }

    const apiKey = decryptApiKey(optimizer);
    const provider = getProvider(optimizer.provider.toLowerCase() as any);

    let totalRecommendations = 0;
    const summaryLines: string[] = [];

    for (const m of agentsWithIssues) {
      const userPrompt = buildOptimizerPrompt(m);
      let rawOutput = '';

      try {
        await provider.run(
          {
            modelId: optimizer.modelId,
            apiKey,
            systemPrompt: OPTIMIZER_SYSTEM_PROMPT,
            temperature: 0.2,
            maxTokensPerTurn: 4096,
          },
          {
            taskId: `optimize-${m.agentId}`,
            executionId: `opt-exec-${run.id}-${m.agentId}`,
            messages: [{ role: 'user', content: userPrompt }],
            tools: [],
            maxTurns: 2,
            onTurn: async (turn) => { rawOutput = turn.content; },
            onToolCall: async () => ({ toolCallId: '', content: '' }),
          }
        );

        const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          logger.warn({ agentId: m.agentId, rawOutput: rawOutput.slice(0, 500) }, 'Optimizer returned non-JSON');
          continue;
        }

        const recs: Array<{
          type: string;
          reason: string;
          before: Record<string, unknown>;
          after: Record<string, unknown>;
          impact: string;
        }> = JSON.parse(jsonMatch[0]);

        for (const rec of recs) {
          await prisma.optimizationRecommendation.create({
            data: {
              runId: run.id,
              agentId: m.agentId,
              type: rec.type,
              reason: rec.reason,
              before: rec.before as any,
              after: rec.after as any,
              impact: rec.impact ?? 'medium',
              status: 'pending',
            },
          });
          totalRecommendations++;
        }

        summaryLines.push(`${m.agentName}: ${recs.length} recommendation(s) — ${m.issues.map((i) => i.type).join(', ')}`);
      } catch (agentErr: any) {
        logger.error({ agentId: m.agentId, err: agentErr.message }, 'Failed to generate recommendations for agent');
      }
    }

    const summary =
      agentsWithIssues.length === 0
        ? 'All agents are performing well — no issues detected.'
        : summaryLines.join('\n');

    await prisma.optimizationRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        agentsAnalyzed: metrics.length,
        recommendationCount: totalRecommendations,
        summary,
      },
    });

    logger.info({ runId: run.id, recommendations: totalRecommendations }, 'Optimization run complete');
  } catch (err: any) {
    logger.error({ runId: run.id, err: err.message }, 'Optimization run failed');
    await prisma.optimizationRun.update({
      where: { id: run.id },
      data: { status: 'failed', completedAt: new Date(), summary: err.message },
    });
  }

  return run.id;
}

// ── Apply a recommendation ────────────────────────────────────────────────────

export async function applyRecommendation(recId: string): Promise<void> {
  const rec = await prisma.optimizationRecommendation.findUnique({
    where: { id: recId },
    include: { agent: true },
  });
  if (!rec) throw new Error('Recommendation not found');
  if (rec.status !== 'pending') throw new Error('Recommendation already actioned');

  const after = rec.after as Record<string, unknown>;

  // Build the DB update payload based on recommendation type
  const updateData: Record<string, unknown> = {};
  switch (rec.type) {
    case 'prompt_update':
      if (after.systemPrompt !== undefined) updateData.systemPrompt = after.systemPrompt;
      break;
    case 'temperature':
      if (after.temperature !== undefined) updateData.temperature = after.temperature;
      break;
    case 'max_turns':
      if (after.maxTurns !== undefined) updateData.maxTurns = after.maxTurns;
      break;
    case 'max_tokens':
      if (after.maxTokensPerTurn !== undefined) updateData.maxTokensPerTurn = after.maxTokensPerTurn;
      break;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.agentRegistration.update({
      where: { id: rec.agentId },
      data: updateData,
    });
  }

  await prisma.optimizationRecommendation.update({
    where: { id: recId },
    data: { status: 'applied', appliedAt: new Date() },
  });

  // Update run applied count
  await prisma.optimizationRun.update({
    where: { id: rec.runId },
    data: { appliedCount: { increment: 1 } },
  });
}

export async function rejectRecommendation(recId: string): Promise<void> {
  const rec = await prisma.optimizationRecommendation.findUnique({ where: { id: recId } });
  if (!rec) throw new Error('Recommendation not found');
  if (rec.status !== 'pending') throw new Error('Recommendation already actioned');

  await prisma.optimizationRecommendation.update({
    where: { id: recId },
    data: { status: 'rejected' },
  });
}
