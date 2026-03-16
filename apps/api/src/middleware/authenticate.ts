import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, validateApiKey } from '../modules/auth/auth.service';
import { prisma } from '../config/database';

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    if (authHeader.startsWith('Bearer ahk_')) {
      // API key auth
      const user = await validateApiKey(authHeader.slice(7));
      if (!user) return reply.status(401).send({ error: 'Invalid API key' });
      (req as any).user = user;
    } else if (authHeader.startsWith('Bearer ')) {
      // JWT auth
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.status(401).send({ error: 'User not found' });
      (req as any).user = user;
    } else {
      return reply.status(401).send({ error: 'Invalid auth scheme' });
    }
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}
