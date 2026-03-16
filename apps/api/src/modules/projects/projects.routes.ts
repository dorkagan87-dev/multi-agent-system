import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import * as svc from './projects.service';
import { taskRoutes } from '../tasks/tasks.routes';
import { prisma } from '../../config/database';

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req) => svc.listProjects((req as any).user.id));

  app.post('/', async (req, reply) => {
    const user = (req as any).user;
    try {
      const project = await svc.createProject(user.id, req.body as any);
      return reply.status(201).send(project);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.getProject(id, user.id);
    } catch {
      return reply.status(404).send({ error: 'Project not found' });
    }
  });

  app.patch('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.updateProject(id, user.id, req.body as any);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    await svc.deleteProject(id, user.id);
    return reply.status(204).send();
  });

  app.post('/:id/start', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.startProject(id, user.id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/pause', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.pauseProject(id, user.id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/resume', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      return await svc.resumeProject(id, user.id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // List agents assigned to this project (via tasks)
  app.get('/:id/agents', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] } });
    if (!project) return reply.status(404).send({ error: 'Not found' });
    const assignedAgentIds = await prisma.task.findMany({
      where: { projectId: id, assignedAgentId: { not: null } },
      select: { assignedAgentId: true },
      distinct: ['assignedAgentId'],
    });
    const ids = assignedAgentIds.map((t) => t.assignedAgentId!);
    const agents = await prisma.agentRegistration.findMany({ where: { id: { in: ids } } });
    return agents;
  });

  // Assign agent to all unassigned tasks in project (bulk assign)
  app.post('/:id/agents/:agentId', async (req, reply) => {
    const user = (req as any).user;
    const { id, agentId } = req.params as { id: string; agentId: string };
    const project = await prisma.project.findFirst({ where: { id, ownerId: user.id } });
    if (!project) return reply.status(403).send({ error: 'Forbidden' });
    const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId: user.id } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    const updated = await prisma.task.updateMany({
      where: { projectId: id, assignedAgentId: null },
      data: { assignedAgentId: agentId },
    });
    return { assigned: updated.count };
  });

  // Unassign agent from all tasks in project
  app.delete('/:id/agents/:agentId', async (req, reply) => {
    const user = (req as any).user;
    const { id, agentId } = req.params as { id: string; agentId: string };
    const project = await prisma.project.findFirst({ where: { id, ownerId: user.id } });
    if (!project) return reply.status(403).send({ error: 'Forbidden' });
    const updated = await prisma.task.updateMany({
      where: { projectId: id, assignedAgentId: agentId },
      data: { assignedAgentId: null },
    });
    return { unassigned: updated.count };
  });

  // Assign agent to a task
  app.patch('/:projectId/tasks/:taskId/assign', async (req, reply) => {
    const user = (req as any).user;
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    const { agentId } = req.body as { agentId: string | null };
    const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: user.id } });
    if (!project) return reply.status(403).send({ error: 'Forbidden' });
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { assignedAgentId: agentId ?? null },
    });
    return task;
  });

  // Nested task routes under /projects/:projectId/tasks
  app.register(taskRoutes, { prefix: '/:projectId/tasks' });
}
