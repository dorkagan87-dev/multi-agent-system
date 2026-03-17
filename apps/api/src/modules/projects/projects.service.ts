import { prisma } from '../../config/database';
import { taskQueue } from '../tasks/tasks.queue';
import { runCEOOrchestration } from '../company/ceo.orchestrator';

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      _count: {
        select: {
          tasks: true,
          members: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
      tasks: {
        include: {
          blockedBy: true,
          blocks: true,
          subTasks: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!project) throw new Error('Project not found');
  return project;
}

export async function createProject(userId: string, data: {
  name: string;
  description?: string;
  goal: string;
  deadline?: string;
}) {
  return prisma.project.create({
    data: {
      ownerId: userId,
      name: data.name,
      description: data.description,
      goal: data.goal,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
    },
  });
}

export async function updateProject(id: string, userId: string, data: Record<string, unknown>) {
  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) throw new Error('Project not found');
  return prisma.project.update({ where: { id }, data: data as any });
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) throw new Error('Project not found');
  await prisma.project.delete({ where: { id } });
}

export async function startProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id, ownerId: userId },
    include: {
      tasks: { include: { blockedBy: true } },
    },
  });
  if (!project) throw new Error('Project not found');
  if (project.status !== 'DRAFT' && project.status !== 'ACTIVE') throw new Error('Project cannot be started');

  if (project.status === 'DRAFT') {
    await prisma.project.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  // If project has no tasks yet → let CEO Orchestrator plan the whole project autonomously
  if (project.tasks.length === 0) {
    runCEOOrchestration(id).catch((err) => {
      console.error('[CEO Orchestration] failed:', err?.message ?? err);
    });
    return { enqueued: 0, mode: 'ceo-orchestrated' };
  }

  // Otherwise enqueue all leaf tasks (no blocking dependencies)
  const leafTasks = project.tasks.filter(
    (t) => t.status === 'PENDING' && t.blockedBy.length === 0,
  );

  for (const task of leafTasks) {
    await taskQueue.add('task-execution', { taskId: task.id }, {
      jobId: task.id,
      removeOnComplete: false,
      removeOnFail: false,
    });
    await prisma.task.update({ where: { id: task.id }, data: { status: 'QUEUED' } });
  }

  return { enqueued: leafTasks.length, mode: 'manual' };
}

export async function pauseProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) throw new Error('Project not found');
  if (project.status !== 'ACTIVE') throw new Error('Only ACTIVE projects can be paused');
  return prisma.project.update({ where: { id }, data: { status: 'PAUSED' } });
}

export async function resumeProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) throw new Error('Project not found');
  if (project.status !== 'PAUSED') throw new Error('Only PAUSED projects can be resumed');
  return prisma.project.update({ where: { id }, data: { status: 'ACTIVE' } });
}
