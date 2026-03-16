/**
 * Optimization Routes
 * GET  /optimize/analysis          — current metrics for all agents
 * POST /optimize/run               — trigger a new optimization run
 * GET  /optimize/runs              — list past runs (latest first)
 * GET  /optimize/runs/:id          — single run + recommendations
 * POST /optimize/recommendations/:id/apply   — apply a recommendation
 * POST /optimize/recommendations/:id/reject  — reject a recommendation
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';
import { analyzeAgents, savePerformanceSnapshots } from './analyzer.service';
import { runOptimizationEngine, applyRecommendation, rejectRecommendation } from './engine.service';

export async function optimizationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // ── Current analysis ─────────────────────────────────────────────────────

  app.get('/analysis', async (req: any) => {
    const metrics = await analyzeAgents(req.user.id);
    return metrics;
  });

  // ── Trigger a run ────────────────────────────────────────────────────────

  app.post('/run', async (req: any, reply) => {
    // Non-blocking: return the run ID immediately, engine runs in background
    const runIdPromise = runOptimizationEngine(req.user.id, 'manual');
    // Still return the run ID (awaiting just the creation, engine is fire-and-forget from here)
    const runId = await runIdPromise;
    reply.code(202).send({ runId });
  });

  // ── List past runs ───────────────────────────────────────────────────────

  app.get('/runs', async (req: any) => {
    const runs = await prisma.optimizationRun.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { recommendations: true } } },
    });
    return runs;
  });

  // ── Single run with recommendations ──────────────────────────────────────

  app.get('/runs/:id', async (req: any, reply) => {
    const run = await prisma.optimizationRun.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        recommendations: {
          include: { agent: { select: { id: true, name: true, jobTitle: true, department: true, provider: true } } },
          orderBy: [{ impact: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return run;
  });

  // ── Apply recommendation ─────────────────────────────────────────────────

  app.post('/recommendations/:id/apply', async (req: any, reply) => {
    // Verify the rec belongs to this user
    const rec = await prisma.optimizationRecommendation.findFirst({
      where: { id: req.params.id, run: { userId: req.user.id } },
    });
    if (!rec) return reply.code(404).send({ error: 'Recommendation not found' });

    await applyRecommendation(req.params.id);
    reply.code(200).send({ applied: true });
  });

  // ── Reject recommendation ─────────────────────────────────────────────────

  app.post('/recommendations/:id/reject', async (req: any, reply) => {
    const rec = await prisma.optimizationRecommendation.findFirst({
      where: { id: req.params.id, run: { userId: req.user.id } },
    });
    if (!rec) return reply.code(404).send({ error: 'Recommendation not found' });

    await rejectRecommendation(req.params.id);
    reply.code(200).send({ rejected: true });
  });

  // ── Save snapshots (internal / cron) ──────────────────────────────────────

  app.post('/snapshots', async (req: any, reply) => {
    await savePerformanceSnapshots(req.user.id);
    reply.code(204).send();
  });
}
