/**
 * Autonomous Hiring Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Agents can request that a new specialist agent be "hired" (spawned).
 * Hiring requests are queued for human approval (or auto-approved if configured).
 *
 * Flow:
 *   1. Agent encounters a task requiring a skill it lacks
 *   2. Agent calls the "request_hire" tool (if granted)
 *   3. HiringRequest is created in DB, platform notifies admins
 *   4. Admin approves → new AgentRegistration is created from a template
 *   5. New agent is assigned the pending task
 */
import { prisma } from '../../config/database';
import { publishEvent } from '../events/events.service';

export type HiringStatus = 'pending' | 'approved' | 'rejected';

export interface HiringRequest {
  id: string;
  requestedByAgentId: string;
  projectId: string;
  role: string;
  department: string;
  skills: string[];
  reason: string;
  status: HiringStatus;
  createdAt: string;
}

// Stored in a simple JSON table via AgentMemory with scope AGENT_GLOBAL
const HIRING_KEY_PREFIX = 'hiring_request_';

export async function createHiringRequest(data: {
  requestedByAgentId: string;
  projectId: string;
  role: string;
  department: string;
  skills: string[];
  reason: string;
}): Promise<HiringRequest> {
  const id = `hire_${Date.now()}`;
  const request: HiringRequest = {
    id,
    requestedByAgentId: data.requestedByAgentId,
    projectId: data.projectId,
    role: data.role,
    department: data.department,
    skills: data.skills,
    reason: data.reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Persist as AgentMemory entry
  await prisma.agentMemory.create({
    data: {
      agentId: data.requestedByAgentId,
      projectId: data.projectId,
      scope: 'PROJECT',
      key: `${HIRING_KEY_PREFIX}${id}`,
      value: request as any,
    },
  });

  // Notify company feed
  const agent = await prisma.agentRegistration.findUnique({ where: { id: data.requestedByAgentId } });
  await publishEvent('agent:message', {
    fromAgentId: data.requestedByAgentId,
    fromAgentName: agent?.name ?? 'Agent',
    toAgentId: null,
    projectId: data.projectId,
    message: `🆕 **Hiring Request**: I need a ${data.role} (${data.department}) with skills in ${data.skills.join(', ')}. Reason: ${data.reason}`,
    timestamp: new Date().toISOString(),
  });

  await publishEvent('company:hiring_request', { request });

  return request;
}

export async function listHiringRequests(userId: string): Promise<HiringRequest[]> {
  // Find all hiring request memories for this user's agents
  const agents = await prisma.agentRegistration.findMany({
    where: { userId },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);

  const memories = await prisma.agentMemory.findMany({
    where: {
      agentId: { in: agentIds },
      key: { startsWith: HIRING_KEY_PREFIX },
    },
    orderBy: { createdAt: 'desc' },
  });

  return memories.map((m) => m.value as unknown as HiringRequest);
}

async function findHiringMemory(requestId: string, userId: string) {
  const agents = await prisma.agentRegistration.findMany({ where: { userId }, select: { id: true } });
  const agentIds = agents.map((a) => a.id);
  const memory = await prisma.agentMemory.findFirst({
    where: { agentId: { in: agentIds }, key: `${HIRING_KEY_PREFIX}${requestId}` },
  });
  if (!memory) throw new Error('Hiring request not found');
  return memory;
}

export async function approveHiringRequest(
  requestId: string,
  userId: string,
  agentConfig: { apiKey: string; provider: string; modelId: string },
): Promise<void> {
  const memory = await findHiringMemory(requestId, userId);
  const request = memory.value as unknown as HiringRequest;

  if (request.status !== 'pending') {
    throw new Error(`Hiring request is already ${request.status}`);
  }

  // Update status
  await prisma.agentMemory.update({
    where: { id: memory.id },
    data: { value: { ...(memory.value as any), status: 'approved' } },
  });

  // Create the new agent
  const { createAgent } = await import('../agents/agents.service');
  await createAgent(userId, {
    name: request.role,
    provider: agentConfig.provider,
    modelId: agentConfig.modelId,
    apiKey: agentConfig.apiKey,
    jobTitle: request.role,
    department: request.department,
    capabilities: request.skills,
    systemPrompt: `You are ${request.role} at AgentHub Corp, specializing in ${request.skills.join(', ')}. ${request.reason}`,
  });

  await publishEvent('company:agent_hired', { request, approvedBy: userId });
}

export async function rejectHiringRequest(requestId: string, userId: string): Promise<void> {
  const memory = await findHiringMemory(requestId, userId);
  const request = memory.value as unknown as HiringRequest;

  if (request.status !== 'pending') {
    throw new Error(`Hiring request is already ${request.status}`);
  }

  await prisma.agentMemory.update({
    where: { id: memory.id },
    data: { value: { ...(memory.value as any), status: 'rejected' } },
  });

  await publishEvent('company:hiring_request', { request: { ...request, status: 'rejected' } });
}
