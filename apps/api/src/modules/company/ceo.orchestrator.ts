/**
 * CEO Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * When a project starts, the CEO agent (highest-capability agent with role CEO
 * or the first IDLE agent) is given the project goal and autonomously:
 *   1. Breaks the goal into a structured work plan (tasks with dependencies)
 *   2. Assigns each task to the best-fit agent by department/capability
 *   3. Writes company-wide announcements to the company feed
 *   4. Monitors progress and re-plans if tasks fail
 *   5. Can spawn "hiring requests" for missing capabilities
 *
 * This runs as a regular task execution against a special CEO prompt.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { prisma } from '../../config/database';
import { taskQueue } from '../tasks/tasks.queue';
import { publishEvent } from '../events/events.service';
import { decryptApiKey } from '../agents/agents.service';
import { getUserSector, buildSectorAwareCEOPrompt } from './sector.service';
import { logger } from '../../utils/logger';
import type { AgentProvider } from '@prisma/client';

const CEO_SYSTEM_PROMPT = `You are the CEO of an autonomous AI company called AgentHub Corp.
Your job is to take a high-level business goal and decompose it into a structured execution plan.

RULES:
- Always respond with a valid JSON object matching the PLAN schema
- Assign tasks to departments: Engineering, Marketing, Research, Analytics, Finance, Legal, Design, Operations
- Set realistic dependencies (tasks that must complete before others start)
- Each task must have clear acceptance criteria so agents know when they're done
- Prioritize tasks: critical > high > medium > low
- Keep task descriptions detailed enough that a specialist AI agent can complete them without asking questions

PLAN SCHEMA:
{
  "announcement": "string — company-wide message about this project",
  "tasks": [
    {
      "title": "string",
      "description": "string — detailed, self-contained task description",
      "acceptanceCriteria": "string — how to know this is done",
      "department": "string",
      "priority": "critical|high|medium|low",
      "dependsOnTitles": ["title of other tasks that must finish first"],
      "estimatedTurns": number
    }
  ]
}

Only output valid JSON. No markdown fences, no trailing commas, no comments. Raw JSON only.`;

export interface CompanyPlan {
  announcement: string;
  tasks: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string;
    department: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    dependsOnTitles: string[];
    estimatedTurns: number;
  }>;
}

export async function runCEOOrchestration(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('Project not found');

  // Find CEO agent — prefer explicit CEO title, fall back to any idle agent with an API key
  const allIdleAgents = await prisma.agentRegistration.findMany({
    where: { userId: project.ownerId, status: 'IDLE' },
    orderBy: { maxTokensPerTurn: 'desc' },
  });

  const ceoAgent =
    allIdleAgents.find((a) =>
      a.jobTitle?.toLowerCase().includes('ceo') ||
      a.jobTitle?.toLowerCase().includes('chief')
    ) ??
    allIdleAgents.find((a) => a.encryptedApiKey) ??
    allIdleAgents[0] ??
    null;

  if (!ceoAgent) {
    logger.warn({ projectId }, 'No idle agent for CEO orchestration — skipping');
    return;
  }

  logger.info({ projectId, agentId: ceoAgent.id, agentName: ceoAgent.name }, 'CEO orchestration starting');

  const apiKey = decryptApiKey(ceoAgent);

  // Inject sector-specific planning rules into the CEO system prompt
  const sector = await getUserSector(project.ownerId);
  const effectiveCEOPrompt = buildSectorAwareCEOPrompt(CEO_SYSTEM_PROMPT, sector);

  // Mark CEO as busy
  await prisma.agentRegistration.update({
    where: { id: ceoAgent.id },
    data: { status: 'BUSY', currentTaskCount: { increment: 1 } },
  });

  // Broadcast CEO is planning
  await broadcastCompanyMessage(ceoAgent.id, ceoAgent.name, projectId,
    `🎯 I'm reviewing the new project: **${project.name}**. Goal: ${project.goal}. Give me a moment to plan our approach...`
  );

  try {
    const userPrompt = `PROJECT: ${project.name}\nGOAL: ${project.goal}\n${project.description ? `CONTEXT: ${project.description}` : ''}\n\nCreate a complete execution plan. Use the submit_plan tool to return the plan. Keep task descriptions concise (2-3 sentences max). Maximum 8 tasks.`;

    const plan = await callCEOPlanner(ceoAgent.provider, ceoAgent.modelId, apiKey, effectiveCEOPrompt, userPrompt);

    // Create tasks with dependency resolution
    const titleToId: Record<string, string> = {};

    // First pass: create all tasks
    for (const t of plan.tasks) {
      const task = await prisma.task.create({
        data: {
          projectId,
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          priority: t.priority.toUpperCase() as any,
          status: 'PENDING',
        },
      });
      titleToId[t.title] = task.id;
    }

    // Second pass: wire dependencies
    for (const t of plan.tasks) {
      const taskId = titleToId[t.title];
      if (!taskId) continue;

      for (const depTitle of (t.dependsOnTitles ?? [])) {
        const depId = titleToId[depTitle];
        if (depId) {
          await prisma.taskDependency.create({
            data: { dependentTaskId: taskId, blockingTaskId: depId },
          }).catch(() => {}); // ignore duplicate
          await prisma.task.update({ where: { id: taskId }, data: { status: 'BLOCKED' } });
        }
      }
    }

    // Auto-assign tasks to agents by department
    await autoAssignByDepartment(projectId, plan.tasks, titleToId, project.ownerId);

    // Enqueue leaf tasks (no dependencies)
    const leafTaskIds = plan.tasks
      .filter((t) => !t.dependsOnTitles?.length)
      .map((t) => titleToId[t.title])
      .filter(Boolean);

    for (const taskId of leafTaskIds) {
      await taskQueue.add('task-execution', { taskId }, { jobId: taskId });
      await prisma.task.update({ where: { id: taskId }, data: { status: 'QUEUED' } });
    }

    // Company-wide announcement
    await broadcastCompanyMessage(ceoAgent.id, ceoAgent.name, projectId,
      `📋 **${project.name}** plan ready! Created ${plan.tasks.length} tasks across ${new Set(plan.tasks.map((t) => t.department)).size} departments. ${leafTaskIds.length} tasks are queued to start immediately.\n\n${plan.announcement}`
    );

    // Persist announcement as company feed event
    await prisma.agentMessage.create({
      data: {
        fromAgentId: ceoAgent.id,
        projectId,
        content: `[CEO PLAN] ${plan.announcement}`,
        metadata: {
          type: 'company_announcement',
          taskCount: plan.tasks.length,
          departments: [...new Set(plan.tasks.map((t) => t.department))],
        },
      },
    });

    logger.info({ projectId, taskCount: plan.tasks.length, leafTaskIds }, 'CEO orchestration complete');

  } catch (err: any) {
    logger.error({ err, projectId }, 'CEO orchestration failed');
    await broadcastCompanyMessage(ceoAgent.id, ceoAgent.name, projectId,
      `⚠️ I encountered an issue planning ${project.name}: ${err.message}. Please review the project goal and try again.`
    );
  } finally {
    await prisma.agentRegistration.update({
      where: { id: ceoAgent.id },
      data: { status: 'IDLE', currentTaskCount: { decrement: 1 } },
    });
  }
}

async function autoAssignByDepartment(
  projectId: string,
  planTasks: CompanyPlan['tasks'],
  titleToId: Record<string, string>,
  ownerId: string,
) {
  const agents = await prisma.agentRegistration.findMany({
    where: { userId: ownerId, status: { not: 'DISABLED' } },
  });

  for (const planTask of planTasks) {
    const taskId = titleToId[planTask.title];
    if (!taskId) continue;

    // Find agent whose department matches
    const match = agents.find((a) =>
      a.department?.toLowerCase() === planTask.department.toLowerCase() ||
      a.jobTitle?.toLowerCase().includes(planTask.department.toLowerCase().split(' ')[0])
    );

    if (match) {
      await prisma.task.update({ where: { id: taskId }, data: { assignedAgentId: match.id } });
    }
  }
}

async function broadcastCompanyMessage(agentId: string, agentName: string, projectId: string, message: string) {
  await publishEvent('agent:message', {
    fromAgentId: agentId,
    fromAgentName: agentName,
    toAgentId: null,
    projectId,
    message,
    timestamp: new Date().toISOString(),
  });
}

// ── Provider-agnostic CEO planner ─────────────────────────────────────────────

const PLAN_TOOL_SCHEMA = {
  announcement: { type: 'string', description: 'Company-wide announcement about this project' },
  tasks: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        acceptanceCriteria: { type: 'string' },
        department: { type: 'string', enum: ['Engineering', 'Marketing', 'Research', 'Analytics', 'Finance', 'Legal', 'Design', 'Operations'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        dependsOnTitles: { type: 'array', items: { type: 'string' } },
        estimatedTurns: { type: 'number' },
      },
      required: ['title', 'description', 'acceptanceCriteria', 'department', 'priority', 'dependsOnTitles', 'estimatedTurns'],
    },
  },
} as const;

async function callCEOPlanner(
  provider: string,
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<CompanyPlan> {
  const isOpenAI = provider === 'OPENAI';

  if (isOpenAI) {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: modelId,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'submit_plan',
          description: 'Submit the completed project execution plan',
          parameters: {
            type: 'object',
            properties: PLAN_TOOL_SCHEMA,
            required: ['announcement', 'tasks'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'submit_plan' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('CEO did not call submit_plan tool');
    return JSON.parse(toolCall.function.arguments) as CompanyPlan;

  } else {
    // Anthropic (default)
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: modelId,
      system: systemPrompt,
      max_tokens: 8000,
      temperature: 0.3,
      tools: [{
        name: 'submit_plan',
        description: 'Submit the completed project execution plan',
        input_schema: {
          type: 'object' as const,
          properties: PLAN_TOOL_SCHEMA,
          required: ['announcement', 'tasks'],
        },
      }],
      tool_choice: { type: 'tool', name: 'submit_plan' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_plan');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('CEO did not call submit_plan tool');
    return toolUse.input as CompanyPlan;
  }
}
