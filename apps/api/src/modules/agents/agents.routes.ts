import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import * as svc from './agents.service';
import { prisma } from '../../config/database';

const CreateAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'google', 'mistral', 'cohere', 'custom']),
  modelId: z.string().min(1),
  apiKey: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokensPerTurn: z.number().int().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  dailyTokenBudget: z.number().int().positive().optional(),
  maxConcurrentTasks: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
  avatarUrl: z.string().url().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  // For importing an existing assistant from the provider
  providerAgentId: z.string().optional(),
});

export async function agentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req) => {
    const user = (req as any).user;
    return svc.listAgents(user.id);
  });

  app.post('/', async (req, reply) => {
    const user = (req as any).user;
    const body = CreateAgentSchema.parse(req.body);
    try {
      const agent = await svc.createAgent(user.id, body);
      return reply.status(201).send(agent);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.getAgent(id, user.id);
    } catch {
      return reply.status(404).send({ error: 'Agent not found' });
    }
  });

  app.patch('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.updateAgent(id, user.id, req.body as Record<string, unknown>);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    await svc.deleteAgent(id, user.id);
    return reply.status(204).send();
  });

  app.post('/:id/enable', async (req) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    return svc.setAgentStatus(id, user.id, true);
  });

  app.post('/:id/disable', async (req) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    return svc.setAgentStatus(id, user.id, false);
  });

  app.post('/:id/tools', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const { toolId, config } = req.body as { toolId: string; config?: Record<string, unknown> };
    try {
      return await svc.grantTool(id, user.id, toolId, config);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id/tools/:toolId', async (req, reply) => {
    const user = (req as any).user;
    const { id, toolId } = req.params as { id: string; toolId: string };
    await svc.revokeTool(id, user.id, toolId);
    return reply.status(204).send();
  });

  // ── Execution history & memory ───────────────────────────────────────────────

  app.get('/:id/executions', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const executions = await prisma.taskExecution.findMany({
      where: { agentId: id, task: { project: { members: { some: { userId: user.id } } } } },
      include: { task: { select: { title: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return executions;
  });

  app.get('/:id/memory', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const agent = await prisma.agentRegistration.findFirst({ where: { id, userId: user.id } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return prisma.agentMemory.findMany({ where: { agentId: id }, orderBy: { updatedAt: 'desc' } });
  });

  // ── Provider import endpoints ────────────────────────────────────────────────

  app.post('/import/list', async (req, reply) => {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!provider || !apiKey) return reply.status(400).send({ error: 'provider and apiKey required' });
    try {
      const agents = await svc.listProviderAgents(provider, apiKey);
      return { agents };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/import/models', async (req, reply) => {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!provider || !apiKey) return reply.status(400).send({ error: 'provider and apiKey required' });
    try {
      const models = await svc.listProviderModels(provider, apiKey);
      return { models };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
