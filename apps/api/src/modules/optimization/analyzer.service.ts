/**
 * Optimization Analyzer
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads task execution history for a user's agents and computes performance
 * metrics. Identifies agents that are underperforming and explains why.
 */
import { prisma } from '../../config/database';

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  provider: string;
  modelId: string;
  department: string | null;
  jobTitle: string | null;
  systemPrompt: string | null;
  temperature: number;
  maxTurns: number;
  maxTokensPerTurn: number;
  // Performance over look-back window
  totalTasks: number;
  successCount: number;
  failureCount: number;
  successRate: number;   // 0–1
  retryRate: number;     // 0–1
  avgTurns: number;
  avgCost: number;
  avgTokens: number;
  // Issues detected
  issues: OptimizationIssue[];
}

export interface OptimizationIssue {
  type: 'low_success_rate' | 'hitting_turn_limit' | 'high_retry_rate' | 'high_cost' | 'always_failing' | 'no_tasks';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

const LOOK_BACK_DAYS = 14;

export async function analyzeAgents(userId: string): Promise<AgentMetrics[]> {
  const since = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 60 * 60 * 1000);

  const agents = await prisma.agentRegistration.findMany({
    where: { userId, status: { not: 'DISABLED' } },
    include: {
      executions: {
        where: { startedAt: { gte: since } },
        select: {
          status: true,
          turns: true,
          totalCost: true,
          promptTokens: true,
          completionTokens: true,
          errorMessage: true,
        },
      },
    },
  });

  const metrics: AgentMetrics[] = [];

  for (const agent of agents) {
    const execs = agent.executions;
    const total = execs.length;
    const successCount = execs.filter((e) => e.status === 'COMPLETED').length;
    const failureCount = execs.filter((e) => e.status === 'FAILED').length;

    // Retry rate — count tasks that were retried (ran more than once)
    // Exclude retries caused by fatal external errors (billing, auth) — those aren't agent quality issues
    const FATAL_ERROR_PATTERNS = ['credit balance', 'insufficient_quota', 'invalid_api_key', 'authentication', 'billing', 'quota exceeded'];
    const taskExecCounts = await prisma.taskExecution.groupBy({
      by: ['taskId'],
      where: {
        agentId: agent.id,
        startedAt: { gte: since },
        NOT: { errorMessage: { in: [] } }, // placeholder, filtered below
      },
      _count: { taskId: true },
    });
    // Fetch fatal-error executions to exclude their tasks from retry count
    const fatalExecs = await prisma.taskExecution.findMany({
      where: { agentId: agent.id, startedAt: { gte: since }, status: 'FAILED' },
      select: { taskId: true, errorMessage: true },
    });
    const fatalTaskIds = new Set(
      fatalExecs
        .filter((e) => e.errorMessage && FATAL_ERROR_PATTERNS.some((p) => e.errorMessage!.toLowerCase().includes(p)))
        .map((e) => e.taskId)
    );
    const nonFatalTaskCounts = taskExecCounts.filter((t) => !fatalTaskIds.has(t.taskId));
    const retriedTasks = nonFatalTaskCounts.filter((t) => t._count.taskId > 1).length;
    const retryRate = nonFatalTaskCounts.length > 0 ? retriedTasks / nonFatalTaskCounts.length : 0;

    const avgTurns = total > 0 ? execs.reduce((s, e) => s + e.turns, 0) / total : 0;
    const avgCost = total > 0 ? execs.reduce((s, e) => s + e.totalCost, 0) / total : 0;
    const avgTokens = total > 0 ? execs.reduce((s, e) => s + e.promptTokens + e.completionTokens, 0) / total : 0;
    const successRate = total > 0 ? successCount / total : 0;

    const issues: OptimizationIssue[] = [];

    if (total === 0) {
      issues.push({ type: 'no_tasks', severity: 'low', detail: 'No tasks executed in the last 14 days — agent may be idle or misconfigured' });
    } else {
      if (successRate < 0.4 && total >= 3) {
        issues.push({ type: 'low_success_rate', severity: 'high', detail: `Only ${Math.round(successRate * 100)}% of tasks succeed — system prompt or model may be poorly configured for this role` });
      } else if (successRate < 0.65 && total >= 3) {
        issues.push({ type: 'low_success_rate', severity: 'medium', detail: `${Math.round(successRate * 100)}% success rate is below target (>70%) — prompt clarity could be improved` });
      }

      if (failureCount === total && total >= 2) {
        issues.push({ type: 'always_failing', severity: 'high', detail: 'Every execution has failed — likely a configuration, API key, or prompt issue' });
      }

      if (avgTurns > agent.maxTurns * 0.85) {
        issues.push({ type: 'hitting_turn_limit', severity: 'medium', detail: `Average ${avgTurns.toFixed(1)} turns is ${Math.round(avgTurns / agent.maxTurns * 100)}% of the ${agent.maxTurns}-turn limit — agent may need more turns or a more focused prompt` });
      }

      if (retryRate > 0.35) {
        issues.push({ type: 'high_retry_rate', severity: 'medium', detail: `${Math.round(retryRate * 100)}% of tasks needed retries — instability in execution` });
      }

      if (avgCost > 0.5) {
        issues.push({ type: 'high_cost', severity: 'low', detail: `Average cost $${avgCost.toFixed(3)} per task is high — consider a smaller model or tighter token limits` });
      }
    }

    metrics.push({
      agentId: agent.id,
      agentName: agent.name,
      provider: agent.provider,
      modelId: agent.modelId,
      department: agent.department,
      jobTitle: agent.jobTitle,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTurns: agent.maxTurns,
      maxTokensPerTurn: agent.maxTokensPerTurn,
      totalTasks: total,
      successCount,
      failureCount,
      successRate,
      retryRate,
      avgTurns,
      avgCost,
      avgTokens,
      issues,
    });
  }

  return metrics;
}

export async function savePerformanceSnapshots(userId: string): Promise<void> {
  const metrics = await analyzeAgents(userId);
  const now = new Date();
  const since = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 60 * 60 * 1000);

  await Promise.all(
    metrics.map((m) =>
      prisma.agentPerformanceSnapshot.create({
        data: {
          agentId: m.agentId,
          periodStart: since,
          periodEnd: now,
          totalTasks: m.totalTasks,
          successCount: m.successCount,
          failureCount: m.failureCount,
          avgTurns: m.avgTurns,
          avgCost: m.avgCost,
          avgTokens: m.avgTokens,
          retryRate: m.retryRate,
          successRate: m.successRate,
        },
      })
    )
  );
}
