import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';

export async function finopsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Summary: totals + top spenders
  app.get('/summary', async (req) => {
    const userId = (req as any).user.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalCostAgg, agents, projects] = await Promise.all([
      // Total cost across all executions in last 30 days
      prisma.taskExecution.aggregate({
        where: { agent: { userId }, startedAt: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
        _sum: { totalCost: true, promptTokens: true, completionTokens: true },
        _count: { id: true },
      }),
      // Cost by agent
      prisma.agentRegistration.findMany({
        where: { userId },
        select: {
          id: true, name: true, provider: true, modelId: true,
          tokensUsedToday: true, dailyTokenBudget: true,
          executions: {
            where: { startedAt: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
            select: { totalCost: true, promptTokens: true, completionTokens: true },
          },
        },
      }),
      // Cost by project
      prisma.project.findMany({
        where: { ownerId: userId },
        select: {
          id: true, name: true, status: true,
          tasks: {
            select: {
              executions: {
                where: { startedAt: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
                select: { totalCost: true },
              },
            },
          },
        },
      }),
    ]);

    const agentStats = agents.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.provider,
      modelId: a.modelId,
      tokensUsedToday: a.tokensUsedToday,
      dailyTokenBudget: a.dailyTokenBudget,
      totalCost: a.executions.reduce((s, e) => s + e.totalCost, 0),
      totalTokens: a.executions.reduce((s, e) => s + e.promptTokens + e.completionTokens, 0),
      executions: a.executions.length,
    })).sort((a, b) => b.totalCost - a.totalCost);

    const projectStats = projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      totalCost: p.tasks.flatMap((t) => t.executions).reduce((s, e) => s + e.totalCost, 0),
    })).sort((a, b) => b.totalCost - a.totalCost);

    return {
      period: '30d',
      totalCost: totalCostAgg._sum.totalCost ?? 0,
      totalTokens: (totalCostAgg._sum.promptTokens ?? 0) + (totalCostAgg._sum.completionTokens ?? 0),
      totalExecutions: totalCostAgg._count.id,
      agents: agentStats,
      projects: projectStats,
    };
  });

  // Daily cost trend (last N days)
  app.get('/trend', async (req) => {
    const userId = (req as any).user.id;
    const days = Math.min(parseInt((req.query as any).days ?? '14', 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);

    const executions = await prisma.taskExecution.findMany({
      where: { agent: { userId }, startedAt: { gte: since }, status: 'COMPLETED' },
      select: { totalCost: true, promptTokens: true, completionTokens: true, startedAt: true },
    });

    // Bucket by day
    const buckets: Record<string, { date: string; cost: number; tokens: number; count: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, cost: 0, tokens: 0, count: 0 };
    }
    for (const e of executions) {
      const key = e.startedAt.toISOString().slice(0, 10);
      if (buckets[key]) {
        buckets[key].cost += e.totalCost;
        buckets[key].tokens += e.promptTokens + e.completionTokens;
        buckets[key].count += 1;
      }
    }

    return Object.values(buckets);
  });
}
