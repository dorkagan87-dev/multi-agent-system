import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { uploadContract, getContract, listContracts } from './contracts.service';
import { sendChatMessage, getChatOrCreate } from './contract-chat.service';
import { logger } from '../../utils/logger';

export async function contractRoutes(app: FastifyInstance) {
  // POST /upload — accepts multipart/form-data with a single "file" field
  // Returns 202 { contractId } immediately; analysis runs async in worker
  app.post('/upload', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

      const file = await req.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const result = await uploadContract(userId, file.filename, buffer, file.mimetype);
      return reply.status(202).send(result);
    } catch (err: any) {
      logger.error({ err }, '[Contracts] Upload error');
      return reply.status(err.status ?? 500).send({ error: err.message });
    }
  });

  // GET / — list the user's contracts (no rawText, includes summary + riskScore)
  app.get('/', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
      return reply.send(await listContracts(userId));
    } catch (err: any) {
      logger.error({ err }, '[Contracts] List error');
      return reply.status(err.status ?? 500).send({ error: err.message });
    }
  });

  // GET /:id — get contract + full analysis (no rawText)
  app.get('/:id', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      return reply.send(await getContract(id, userId));
    } catch (err: any) {
      logger.error({ err }, '[Contracts] Get error');
      return reply.status(err.status ?? 500).send({ error: err.message });
    }
  });

  // GET /:id/chat — fetch chat history for a contract
  app.get('/:id/chat', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      await getContract(id, userId); // ownership check
      return reply.send(await getChatOrCreate(id));
    } catch (err: any) {
      logger.error({ err }, '[Contracts] Get chat error');
      return reply.status(err.status ?? 500).send({ error: err.message });
    }
  });

  // POST /:id/chat — send a follow-up question about the contract
  app.post('/:id/chat', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const userId = req.user?.id;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
      const { id } = req.params as { id: string };
      const { message } = req.body as { message?: string };
      if (!message?.trim()) return reply.status(400).send({ error: 'message is required' });
      await getContract(id, userId); // ownership check
      return reply.send(await sendChatMessage(id, message.trim()));
    } catch (err: any) {
      logger.error({ err }, '[Contracts] Chat message error');
      return reply.status(err.status ?? 500).send({ error: err.message });
    }
  });
}
