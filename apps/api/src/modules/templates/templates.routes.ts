import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  saveProjectAsTemplate,
  deleteTemplate,
  launchTemplate,
} from './templates.service';

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // List all templates (built-in + user's own)
  app.get('/', async (req) => {
    const user = (req as any).user;
    return listTemplates(user.id);
  });

  // Get single template
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const template = await getTemplate(id);
    if (!template) return reply.status(404).send({ error: 'Template not found' });
    return template;
  });

  // Create template from scratch
  app.post('/', async (req, reply) => {
    const user = (req as any).user;
    const body = req.body as any;
    if (!body.name || !body.goal || !Array.isArray(body.tasks)) {
      return reply.status(400).send({ error: 'name, goal, and tasks are required' });
    }
    return createTemplate(user.id, body);
  });

  // Save existing project as a template
  app.post('/from-project/:projectId', async (req, reply) => {
    const user = (req as any).user;
    const { projectId } = req.params as { projectId: string };
    const { name, description } = (req.body ?? {}) as { name?: string; description?: string };
    try {
      return await saveProjectAsTemplate(user.id, projectId, name, description);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Launch a project from a template
  app.post('/:id/launch', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    if (!body.projectName) {
      return reply.status(400).send({ error: 'projectName is required' });
    }
    try {
      return await launchTemplate(user.id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Delete user's template
  app.delete('/:id', async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      await deleteTemplate(user.id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
