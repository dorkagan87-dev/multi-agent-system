import { prisma } from '../../config/database';
import type { TaskPriority } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateTaskInput {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  department?: string;
  suggestedRole?: string;
  order?: number;
}

export interface CreateTemplateInput {
  name: string;
  description: string;
  goal: string;
  category?: string;
  icon?: string;
  tasks: TemplateTaskInput[];
}

export interface LaunchTemplateInput {
  projectName: string;
  goal?: string;
  agentAssignments?: Record<string, string>; // suggestedRole → agentId
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listTemplates(userId: string) {
  return prisma.projectTemplate.findMany({
    where: { OR: [{ isBuiltIn: true }, { userId }] },
    include: { tasks: { orderBy: { order: 'asc' } } },
    orderBy: [{ isBuiltIn: 'desc' }, { useCount: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getTemplate(id: string) {
  return prisma.projectTemplate.findUnique({
    where: { id },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createTemplate(userId: string, input: CreateTemplateInput) {
  const { tasks, ...rest } = input;
  return prisma.projectTemplate.create({
    data: {
      ...rest,
      userId,
      tasks: {
        create: tasks.map((t, i) => ({ ...t, order: t.order ?? i })),
      },
    },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
}

export async function saveProjectAsTemplate(
  userId: string,
  projectId: string,
  name?: string,
  description?: string,
): Promise<ReturnType<typeof createTemplate>> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { tasks: { orderBy: { createdAt: 'asc' } } },
  });
  if (!project) throw new Error('Project not found');

  return createTemplate(userId, {
    name: name ?? `${project.name} Template`,
    description: description ?? project.description ?? project.goal.slice(0, 200),
    goal: project.goal,
    category: 'custom',
    icon: '📁',
    tasks: project.tasks.map((t, i) => ({
      title: t.title,
      description: t.description,
      acceptanceCriteria: t.acceptanceCriteria ?? undefined,
      priority: t.priority,
      department: undefined,
      suggestedRole: undefined,
      order: i,
    })),
  });
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  const template = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!template) throw new Error('Template not found');
  if (template.isBuiltIn) throw new Error('Cannot delete built-in templates');
  if (template.userId !== userId) throw new Error('Not your template');
  await prisma.projectTemplate.delete({ where: { id } });
}

export async function launchTemplate(
  userId: string,
  templateId: string,
  input: LaunchTemplateInput,
): Promise<{ projectId: string }> {
  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
  if (!template) throw new Error('Template not found');

  const { agentAssignments = {} } = input;

  // Create project + tasks in one transaction
  const project = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.create({
      data: {
        ownerId: userId,
        name: input.projectName,
        goal: input.goal ?? template.goal,
        description: template.description,
        status: 'DRAFT',
      },
    });

    for (const task of template.tasks) {
      // Match agentId by suggestedRole or department
      const agentId =
        (task.suggestedRole && agentAssignments[task.suggestedRole]) ||
        (task.department && agentAssignments[task.department]) ||
        null;

      await tx.task.create({
        data: {
          projectId: proj.id,
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria ?? null,
          priority: task.priority,
          assignedAgentId: agentId,
        },
      });
    }

    return proj;
  });

  // Increment use count (fire-and-forget)
  prisma.projectTemplate.update({
    where: { id: templateId },
    data: { useCount: { increment: 1 } },
  }).catch(() => {});

  return { projectId: project.id };
}
