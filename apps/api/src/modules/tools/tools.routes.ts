import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';
import { z } from 'zod';

const toolSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Tool name must be lowercase with underscores only'),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()).default({}),
  isBuiltIn: z.boolean().default(false),
});

export async function toolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async () => prisma.tool.findMany({ orderBy: { name: 'asc' } }));

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tool = await prisma.tool.findUnique({ where: { id } });
    if (!tool) return reply.status(404).send({ error: 'Tool not found' });
    return tool;
  });

  app.post('/', async (req, reply) => {
    const body = toolSchema.parse(req.body);
    const existing = await prisma.tool.findUnique({ where: { name: body.name } });
    if (existing) return reply.status(409).send({ error: `Tool "${body.name}" already exists` });
    return reply.status(201).send(await prisma.tool.create({ data: body as any }));
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = toolSchema.partial().parse(req.body);
    const tool = await prisma.tool.findUnique({ where: { id } });
    if (!tool) return reply.status(404).send({ error: 'Tool not found' });
    if (tool.isBuiltIn) return reply.status(403).send({ error: 'Built-in tools cannot be modified' });
    return prisma.tool.update({ where: { id }, data: body as any });
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tool = await prisma.tool.findUnique({ where: { id } });
    if (!tool) return reply.status(404).send({ error: 'Tool not found' });
    if (tool.isBuiltIn) return reply.status(403).send({ error: 'Built-in tools cannot be deleted' });
    await prisma.tool.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Grant a tool to an agent
  app.post('/:id/grant/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string };
    const user = (req as any).user;
    const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId: user.id } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    const tool = await prisma.tool.findUnique({ where: { id } });
    if (!tool) return reply.status(404).send({ error: 'Tool not found' });
    const grant = await prisma.agentToolGrant.upsert({
      where: { agentId_toolId: { agentId, toolId: id } },
      create: { agentId, toolId: id },
      update: {},
    });
    return reply.status(201).send(grant);
  });

  // Revoke a tool from an agent
  app.delete('/:id/grant/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string };
    const user = (req as any).user;
    const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId: user.id } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    await prisma.agentToolGrant.deleteMany({ where: { agentId, toolId: id } });
    return reply.status(204).send();
  });
}
