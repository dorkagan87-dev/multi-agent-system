import type { FastifyInstance } from 'fastify';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';
import { taskQueue } from '../tasks/tasks.queue';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/stats', async (req) => {
    const userId = (req as any).user.id;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [
      totalAgents, activeAgents,
      totalProjects, activeProjects,
      totalTasks, completedToday, failedToday, runningTasks,
      queuedJobs,
    ] = await Promise.all([
      prisma.agentRegistration.count({ where: { userId } }),
      prisma.agentRegistration.count({ where: { userId, status: 'BUSY' } }),
      prisma.project.count({ where: { ownerId: userId } }),
      prisma.project.count({ where: { ownerId: userId, status: 'ACTIVE' } }),
      prisma.task.count({ where: { project: { ownerId: userId } } }),
      prisma.task.count({ where: { project: { ownerId: userId }, status: 'COMPLETED', completedAt: { gte: today } } }),
      prisma.task.count({ where: { project: { ownerId: userId }, status: 'FAILED', updatedAt: { gte: today } } }),
      prisma.task.count({ where: { project: { ownerId: userId }, status: 'RUNNING' } }),
      taskQueue.getJobCounts(),
    ]);

    const tokenSum = await prisma.agentRegistration.aggregate({
      where: { userId },
      _sum: { tokensUsedToday: true },
    });

    return {
      totalAgents, activeAgents,
      totalProjects, activeProjects,
      totalTasks, completedTasksToday: completedToday,
      failedTasksToday: failedToday, runningTasks,
      tokensUsedToday: tokenSum._sum.tokensUsedToday ?? 0,
      queue: queuedJobs,
    };
  });

  app.get('/activity', async (req) => {
    const userId = (req as any).user.id;
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
  });
}
