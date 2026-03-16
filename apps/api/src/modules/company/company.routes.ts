import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { runMeeting } from './meeting.service';
import { listHiringRequests, approveHiringRequest, rejectHiringRequest } from './hiring.service';
import { prisma } from '../../config/database';
import { z } from 'zod';

export async function companyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // ── Company Feed ─────────────────────────────────────────────────────────────
  app.get('/feed', async (req) => {
    const user = (req as any).user;
    const { projectId, limit = 100 } = req.query as { projectId?: string; limit?: number };

    const agents = await prisma.agentRegistration.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const agentIds = agents.map((a: any) => a.id);

    return prisma.agentMessage.findMany({
      where: {
        fromAgentId: { in: agentIds },
        ...(projectId ? { projectId } : {}),
      },
      include: {
        fromAgent: { select: { id: true, name: true, jobTitle: true, department: true, provider: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: Number(limit),
    });
  });

  // ── Meetings ──────────────────────────────────────────────────────────────────
  app.post('/meetings', async (req, reply) => {
    const user = (req as any).user;
    const schema = z.object({
      projectId: z.string(),
      topic: z.string().min(1),
      agentIds: z.array(z.string()).min(2).max(6),
      rounds: z.number().int().min(1).max(5).default(2),
    });
    const body = schema.parse(req.body);

    // Verify user owns the agents
    const count = await prisma.agentRegistration.count({
      where: { id: { in: body.agentIds }, userId: user.id },
    });
    if (count !== body.agentIds.length) {
      return reply.status(403).send({ error: 'You do not own all specified agents' });
    }

    try {
      const result = await runMeeting({
        ...body,
        callerId: body.agentIds[0],
      });
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Hiring ────────────────────────────────────────────────────────────────────
  app.get('/hiring', async (req) => {
    const user = (req as any).user;
    return listHiringRequests(user.id);
  });

  app.post('/hiring/:requestId/approve', async (req, reply) => {
    const user = (req as any).user;
    const { requestId } = req.params as { requestId: string };
    const body = z.object({
      apiKey: z.string().min(1),
      provider: z.string().min(1),
      modelId: z.string().min(1),
    }).parse(req.body);

    try {
      await approveHiringRequest(requestId, user.id, body);
      return { approved: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/hiring/:requestId/reject', async (req, reply) => {
    const user = (req as any).user;
    const { requestId } = req.params as { requestId: string };
    try {
      await rejectHiringRequest(requestId, user.id);
      return reply.send({ rejected: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
