import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from './auth.service';
import { authenticate } from '../../middleware/authenticate';
import { prisma } from '../../config/database';

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown, reply: any): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.status(400).send({ error: result.error.errors[0]?.message ?? 'Invalid request body' });
    return null;
  }
  return result.data;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const body = parseBody(
      z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() }),
      req.body, reply,
    );
    if (!body) return;
    try {
      const user = await svc.register(body.email, body.password, body.name);
      return reply.status(201).send(user);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/login', async (req, reply) => {
    const body = parseBody(
      z.object({ email: z.string().email(), password: z.string() }),
      req.body, reply,
    );
    if (!body) return;
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

  // PATCH /me — update display name and/or email
  app.patch('/me', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const body = parseBody(
      z.object({ name: z.string().min(1).optional(), email: z.string().email().optional() }),
      req.body, reply,
    );
    if (!body) return;
    try {
      const updated = await svc.updateProfile(user.id, body);
      return reply.send(updated);
    } catch (err: any) {
      return reply.status(err.status ?? 400).send({ error: err.message });
    }
  });

  // POST /change-password — change password while authenticated
  app.post('/change-password', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const body = parseBody(
      z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      }),
      req.body, reply,
    );
    if (!body) return;
    try {
      await svc.changePassword(user.id, body.currentPassword, body.newPassword);
      return reply.send({ message: 'Password updated successfully' });
    } catch (err: any) {
      return reply.status(err.status ?? 400).send({ error: err.message });
    }
  });

  app.post('/api-keys', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const body = parseBody(z.object({ name: z.string().min(1) }), req.body, reply);
    if (!body) return;
    const result = await svc.generateApiKey(user.id, body.name);
    return reply.status(201).send(result);
  });

  app.delete('/api-keys/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    await prisma.apiKey.deleteMany({ where: { id, userId: user.id } });
    return reply.status(204).send();
  });

  // POST /forgot-password — request a password reset email
  app.post('/forgot-password', async (req, reply) => {
    const body = parseBody(z.object({ email: z.string().email() }), req.body, reply);
    if (!body) return;
    try {
      await svc.requestPasswordReset(body.email);
    } catch {
      // Swallow errors — always return 200 to avoid leaking whether email exists
    }
    // Always return the same response regardless of outcome
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' });
  });

  // POST /reset-password — set a new password using the token from email
  app.post('/reset-password', async (req, reply) => {
    const body = parseBody(
      z.object({
        token: z.string().min(1),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      }),
      req.body, reply,
    );
    if (!body) return;
    try {
      await svc.resetPassword(body.token, body.password);
      return reply.send({ message: 'Password updated successfully.' });
    } catch (err: any) {
      return reply.status(err.status ?? 400).send({ error: err.message });
    }
  });
}
