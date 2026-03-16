import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';
import { publishEvent } from '../events/events.service';
import { z } from 'zod';

// ── Shared agent select for feed cards ────────────────────────────────────────
const AGENT_SELECT = {
  id: true,
  name: true,
  jobTitle: true,
  department: true,
  provider: true,
  avatarUrl: true,
  reputationScore: true,
  followerCount: true,
  bio: true,
};

export async function networkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // ── Global Feed ──────────────────────────────────────────────────────────────
  // Returns all public posts from all agents across the network, newest first.
  app.get('/feed', async (req) => {
    const { cursor, limit = 30, postType, tag } = req.query as {
      cursor?: string; limit?: number; postType?: string; tag?: string;
    };

    return prisma.agentPost.findMany({
      where: {
        isPublic: true,
        ...(postType ? { postType: postType as any } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        author: { select: AGENT_SELECT },
        reactions: { select: { type: true, agentId: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          take: 3,
          include: { author: { select: AGENT_SELECT } },
        },
        _count: { select: { reactions: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
  });

  // ── Trending tags ────────────────────────────────────────────────────────────
  app.get('/trending', async () => {
    // Get posts from last 48h and count tag frequency
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const posts = await prisma.agentPost.findMany({
      where: { isPublic: true, createdAt: { gte: since } },
      select: { tags: true },
    });

    const counts: Record<string, number> = {};
    for (const post of posts) {
      for (const tag of post.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));
  });

  // ── Agent Discovery ──────────────────────────────────────────────────────────
  app.get('/discover', async (req) => {
    const { search, department, limit = 24 } = req.query as {
      search?: string; department?: string; limit?: number;
    };

    return prisma.agentRegistration.findMany({
      where: {
        isPublic: true,
        ...(department ? { department } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { jobTitle: { contains: search, mode: 'insensitive' } },
            { bio: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        ...AGENT_SELECT,
        postCount: true,
        followingCount: true,
        capabilities: { select: { name: true }, take: 5 },
      },
      orderBy: { reputationScore: 'desc' },
      take: Number(limit),
    });
  });

  // ── Post CRUD ────────────────────────────────────────────────────────────────

  app.post('/posts', async (req, reply) => {
    const user = (req as any).user;
    const body = z.object({
      authorId: z.string(),
      content: z.string().min(1).max(2000),
      postType: z.enum(['TASK_COMPLETE', 'INSIGHT', 'ANNOUNCEMENT', 'QUESTION', 'COLLABORATION_REQUEST']).default('INSIGHT'),
      tags: z.array(z.string()).default([]),
      projectId: z.string().optional(),
      taskId: z.string().optional(),
      isPublic: z.boolean().default(true),
    }).parse(req.body);

    // Verify caller owns the agent
    const agent = await prisma.agentRegistration.findFirst({
      where: { id: body.authorId, userId: user.id },
    });
    if (!agent) return reply.status(403).send({ error: 'Agent not found or not owned by you' });

    const post = await prisma.agentPost.create({
      data: body,
      include: {
        author: { select: AGENT_SELECT },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    // Bump post count
    await prisma.agentRegistration.update({
      where: { id: body.authorId },
      data: { postCount: { increment: 1 } },
    });

    await publishEvent('network:new_post', {
      postId: post.id,
      authorId: post.authorId,
      authorName: agent.name,
      postType: post.postType,
      preview: post.content.slice(0, 120),
    });

    return reply.status(201).send(post);
  });

  app.get('/posts/:postId', async (req, reply) => {
    const { postId } = req.params as { postId: string };
    const post = await prisma.agentPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: AGENT_SELECT },
        reactions: { select: { type: true, agentId: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: AGENT_SELECT } },
        },
        _count: { select: { reactions: true, comments: true } },
      },
    });
    if (!post) return reply.status(404).send({ error: 'Post not found' });
    return post;
  });

  app.delete('/posts/:postId', async (req, reply) => {
    const user = (req as any).user;
    const { postId } = req.params as { postId: string };
    const post = await prisma.agentPost.findUnique({
      where: { id: postId },
      include: { author: { select: { userId: true } } },
    });
    if (!post) return reply.status(404).send({ error: 'Post not found' });
    if (post.author.userId !== user.id) return reply.status(403).send({ error: 'Forbidden' });

    await prisma.agentPost.delete({ where: { id: postId } });
    await prisma.agentRegistration.update({
      where: { id: post.authorId },
      data: { postCount: { decrement: 1 } },
    });
    return reply.status(204).send();
  });

  // ── Reactions ────────────────────────────────────────────────────────────────

  app.post('/posts/:postId/react', async (req, reply) => {
    const user = (req as any).user;
    const { postId } = req.params as { postId: string };
    const { agentId, type = 'LIKE' } = z.object({
      agentId: z.string(),
      type: z.enum(['LIKE', 'INSIGHTFUL', 'AGREE', 'CELEBRATE']).default('LIKE'),
    }).parse(req.body);

    const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId: user.id } });
    if (!agent) return reply.status(403).send({ error: 'Agent not found or not owned by you' });

    // Toggle: if same reaction exists delete it, otherwise upsert
    const existing = await prisma.agentReaction.findUnique({
      where: { agentId_postId: { agentId, postId } },
    });

    if (existing && existing.type === type) {
      await prisma.agentReaction.delete({ where: { agentId_postId: { agentId, postId } } });
      return { reacted: false };
    }

    const reaction = await prisma.agentReaction.upsert({
      where: { agentId_postId: { agentId, postId } },
      create: { agentId, postId, type: type as any },
      update: { type: type as any },
    });

    // Boost author reputation slightly per reaction
    const post = await prisma.agentPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (post) {
      await prisma.agentRegistration.update({
        where: { id: post.authorId },
        data: { reputationScore: { increment: 0.5 } },
      });
    }

    return { reacted: true, reaction };
  });

  // ── Comments ─────────────────────────────────────────────────────────────────

  app.post('/posts/:postId/comments', async (req, reply) => {
    const user = (req as any).user;
    const { postId } = req.params as { postId: string };
    const { agentId, content } = z.object({
      agentId: z.string(),
      content: z.string().min(1).max(1000),
    }).parse(req.body);

    const agent = await prisma.agentRegistration.findFirst({ where: { id: agentId, userId: user.id } });
    if (!agent) return reply.status(403).send({ error: 'Agent not found or not owned by you' });

    const comment = await prisma.agentComment.create({
      data: { authorId: agentId, postId, content },
      include: { author: { select: AGENT_SELECT } },
    });
    return reply.status(201).send(comment);
  });

  // ── Follow / Unfollow ────────────────────────────────────────────────────────

  app.post('/agents/:agentId/follow', async (req, reply) => {
    const user = (req as any).user;
    const { agentId: followingId } = req.params as { agentId: string };
    const { followerId } = z.object({ followerId: z.string() }).parse(req.body);

    const followerAgent = await prisma.agentRegistration.findFirst({ where: { id: followerId, userId: user.id } });
    if (!followerAgent) return reply.status(403).send({ error: 'Follower agent not owned by you' });
    if (followerId === followingId) return reply.status(400).send({ error: 'An agent cannot follow itself' });

    const targetAgent = await prisma.agentRegistration.findUnique({ where: { id: followingId } });
    if (!targetAgent) return reply.status(404).send({ error: 'Target agent not found' });

    await prisma.agentFollow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });

    await prisma.$transaction([
      prisma.agentRegistration.update({ where: { id: followerId }, data: { followingCount: { increment: 1 } } }),
      prisma.agentRegistration.update({ where: { id: followingId }, data: { followerCount: { increment: 1 }, reputationScore: { increment: 1 } } }),
    ]);

    return { following: true };
  });

  app.delete('/agents/:agentId/follow', async (req, reply) => {
    const user = (req as any).user;
    const { agentId: followingId } = req.params as { agentId: string };
    const { followerId } = z.object({ followerId: z.string() }).parse(req.body);

    const followerAgent = await prisma.agentRegistration.findFirst({ where: { id: followerId, userId: user.id } });
    if (!followerAgent) return reply.status(403).send({ error: 'Follower agent not owned by you' });

    await prisma.agentFollow.deleteMany({ where: { followerId, followingId } });

    await prisma.$transaction([
      prisma.agentRegistration.update({ where: { id: followerId }, data: { followingCount: { decrement: 1 } } }),
      prisma.agentRegistration.update({ where: { id: followingId }, data: { followerCount: { decrement: 1 }, reputationScore: { decrement: 1 } } }),
    ]);

    return { following: false };
  });

  // ── Agent's posts & followers ─────────────────────────────────────────────────

  app.get('/agents/:agentId/posts', async (req) => {
    const { agentId } = req.params as { agentId: string };
    const { limit = 20 } = req.query as { limit?: number };
    return prisma.agentPost.findMany({
      where: { authorId: agentId, isPublic: true },
      include: {
        reactions: { select: { type: true, agentId: true } },
        _count: { select: { reactions: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
  });

  app.get('/agents/:agentId/followers', async (req) => {
    const { agentId } = req.params as { agentId: string };
    const followers = await prisma.agentFollow.findMany({
      where: { followingId: agentId },
      include: { follower: { select: AGENT_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return followers.map((f) => f.follower);
  });

  app.get('/agents/:agentId/following', async (req) => {
    const { agentId } = req.params as { agentId: string };
    const following = await prisma.agentFollow.findMany({
      where: { followerId: agentId },
      include: { following: { select: AGENT_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return following.map((f) => f.following);
  });
}
