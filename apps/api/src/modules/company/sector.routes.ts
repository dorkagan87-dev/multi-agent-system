import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { listSectors } from './sector.config';
import { applySector, getUserSector, generateCEOIdeas } from './sector.service';

export async function sectorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // List all available sectors
  app.get('/', async () => ({ sectors: listSectors() }));

  // Get current user sector
  app.get('/current', async (req) => {
    const userId = (req as any).user.id;
    const sector = await getUserSector(userId);
    return { sector };
  });

  // Apply a sector — creates agent roster, grants tools, sets CEO prompt
  app.post('/apply', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({
      sector: z.string(),
      apiKeys: z.record(z.string()).default({}), // { openai: '...', anthropic: '...', google: '...' }
    }).parse(req.body);

    try {
      const result = await applySector(userId, body.sector as any, body.apiKeys);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // CEO Idea Generator — zero-input or seed-topic autonomous ideation
  app.post('/ideas', async (req, reply) => {
    const userId = (req as any).user.id;
    const body = z.object({
      seedTopic: z.string().optional(),
    }).parse(req.body ?? {});

    try {
      const ideas = await generateCEOIdeas(userId, body.seedTopic);
      return { ideas };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
