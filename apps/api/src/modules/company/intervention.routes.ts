import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import {
  messageAgent, overrideTask, pauseDepartment, resumeDepartment,
  injectContext, redirectTask,
} from './intervention.service';
import { prisma } from '../../config/database';
import { publishEvent } from '../events/events.service';

export async function interventionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Message an agent directly
  app.post('/message-agent', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({ agentId: z.string(), message: z.string().min(1), projectId: z.string() }).parse(req.body);
    await messageAgent(userId, body.agentId, body.message, body.projectId);
    return { sent: true };
  });

  // Override a task (update + re-run)
  app.post('/override-task', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({
      taskId: z.string(),
      updates: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        acceptanceCriteria: z.string().optional(),
        assignedAgentId: z.string().optional(),
        priority: z.string().optional(),
      }),
    }).parse(req.body);
    try {
      await overrideTask(userId, body.taskId, body.updates);
      return { overridden: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Pause/resume a department
  app.post('/pause-department', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({ projectId: z.string(), department: z.string() }).parse(req.body);
    const count = await pauseDepartment(userId, body.projectId, body.department);
    return { paused: count };
  });

  app.post('/resume-department', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({ projectId: z.string(), department: z.string() }).parse(req.body);
    const count = await resumeDepartment(userId, body.projectId, body.department);
    return { resumed: count, requeued: count };
  });

  // Inject context into agent memory
  app.post('/inject-context', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({
      agentId: z.string(),
      projectId: z.string().nullable().optional(),
      key: z.string().min(1),
      value: z.unknown(),
    }).parse(req.body);
    await injectContext(userId, body.agentId, body.projectId ?? null, body.key, body.value);
    return { injected: true };
  });

  // List pending HITL questions
  app.get('/questions', async (req) => {
    const userId = (req as any).user.id;
    const questions = await prisma.agentMemory.findMany({
      where: {
        agent: { userId },
        tags: { has: 'pending' },
        key: { startsWith: 'hitl_' },
      },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return questions.map((q) => ({
      questionId: q.key,
      agentId: q.agentId,
      agentName: (q as any).agent?.name,
      projectId: q.projectId,
      question: (q.value as any).question,
      urgency: (q.value as any).urgency,
      status: (q.value as any).status,
      answer: (q.value as any).answer,
      createdAt: q.createdAt,
    }));
  });

  // Reply to a HITL question
  app.post('/questions/:questionId/reply', async (req, reply) => {
    const userId = (req as any).user.id;
    const { questionId } = req.params as { questionId: string };
    const { answer } = req.body as { answer: string };
    if (!answer?.trim()) return reply.status(400).send({ error: 'answer is required' });

    const memory = await prisma.agentMemory.findFirst({
      where: { key: questionId, agent: { userId } },
    });
    if (!memory) return reply.status(404).send({ error: 'Question not found' });

    const val = memory.value as Record<string, unknown>;
    await prisma.agentMemory.update({
      where: { id: memory.id },
      data: {
        value: { ...val, status: 'answered', answer },
        tags: ['hitl', 'answered', val.urgency as string],
      },
    });

    await publishEvent('hitl:answered', {
      questionId,
      agentId: memory.agentId,
      projectId: memory.projectId,
      answer,
    });

    return { replied: true };
  });

  // Redirect task to another agent
  app.post('/redirect-task', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({ taskId: z.string(), newAgentId: z.string() }).parse(req.body);
    try {
      await redirectTask(userId, body.taskId, body.newAgentId);
      return { redirected: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
