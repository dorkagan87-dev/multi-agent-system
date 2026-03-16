import type { FastifyInstance } from 'fastify';
import * as svc from './tasks.service';

export async function taskRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return svc.listTasks(projectId);
  });

  app.post('/', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    try {
      const task = await svc.createTask(projectId, req.body as any);
      return reply.status(201).send(task);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    try {
      return await svc.getTask(id, projectId);
    } catch {
      return reply.status(404).send({ error: 'Task not found' });
    }
  });

  app.patch('/:id', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    try {
      return await svc.updateTask(id, projectId, req.body as any);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    await svc.deleteTask(id, projectId);
    return reply.status(204).send();
  });

  app.post('/:id/retry', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    try {
      await svc.retryTask(id, projectId);
      return { queued: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/cancel', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    try {
      return await svc.cancelTask(id, projectId);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id/executions/:execId/logs', async (req) => {
    const { execId } = req.params as { execId: string };
    return svc.getExecutionLogs(execId);
  });

  // Schedule a task to run at a specific time
  app.post('/:id/schedule', async (req, reply) => {
    const { projectId, id } = req.params as { projectId: string; id: string };
    const { scheduledAt } = req.body as { scheduledAt: string };
    if (!scheduledAt) return reply.status(400).send({ error: 'scheduledAt is required' });
    try {
      return await svc.scheduleTask(id, projectId, new Date(scheduledAt));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
