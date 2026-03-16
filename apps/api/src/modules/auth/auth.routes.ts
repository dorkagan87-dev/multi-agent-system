import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from './auth.service';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../config/database';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() }).parse(req.body);
    try {
      const user = await svc.register(body.email, body.password, body.name);
      return reply.status(201).send(user);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    try {
      const result = await svc.login(body.email, body.password);
      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      });
      return { user: result.user, accessToken: result.tokens.accessToken };
    } catch {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
  });

  app.post('/refresh', async (req, reply) => {
    const token = (req.cookies as any)?.refreshToken;
    if (!token) return reply.status(401).send({ error: 'No refresh token' });
    try {
      const payload = svc.verifyRefreshToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.status(401).send({ error: 'User not found' });
      const tokens = svc.issueTokens(user.id, user.role);
      return { accessToken: tokens.accessToken };
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
  });

  app.get('/me', { preHandler: [authenticate] }, async (req) => {
    const user = (req as any).user;
    const { passwordHash: _, ...safe } = user;
    return safe;
  });

  app.post('/api-keys', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const result = await svc.generateApiKey(user.id, name);
    return reply.status(201).send(result);
  });

  app.delete('/api-keys/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    await prisma.apiKey.deleteMany({ where: { id, userId: user.id } });
    return reply.status(204).send();
  });
}
