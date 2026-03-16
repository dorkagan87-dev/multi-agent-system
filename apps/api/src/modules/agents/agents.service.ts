import { prisma } from '../../config/database';
import { encrypt, decrypt } from '../../utils/crypto';
import { getProvider, getImporter, ProviderKey } from './providers/registry';
import type { AgentProvider } from '@prisma/client';

function toProviderKey(p: AgentProvider): ProviderKey {
  return p.toLowerCase() as ProviderKey;
}

export async function listAgents(userId: string) {
  return prisma.agentRegistration.findMany({
    where: { userId },
    include: {
      capabilities: true,
      toolGrants: { include: { tool: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getAgent(id: string, userId: string) {
  const agent = await prisma.agentRegistration.findFirst({
    where: { id, userId },
    include: {
      capabilities: true,
      toolGrants: { include: { tool: true } },
    },
  });
  if (!agent) throw new Error('Agent not found');
  return agent;
}

export async function createAgent(userId: string, data: {
  name: string;
  description?: string;
  provider: string;
  modelId: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokensPerTurn?: number;
  maxTurns?: number;
  dailyTokenBudget?: number;
  maxConcurrentTasks?: number;
  capabilities?: string[];
  avatarUrl?: string;
  jobTitle?: string;
  department?: string;
  providerAgentId?: string;
}) {
  const { encrypted, iv } = encrypt(data.apiKey);
  const providerKey = toProviderKey(data.provider.toUpperCase() as AgentProvider);

  // Validate credentials
  const provider = getProvider(providerKey);
  const valid = await provider.validateCredentials(data.apiKey);
  if (!valid) throw new Error('Invalid API key for provider');

  const agent = await prisma.agentRegistration.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      provider: data.provider.toUpperCase() as AgentProvider,
      modelId: data.modelId,
      providerAgentId: data.providerAgentId,
      encryptedApiKey: encrypted,
      apiKeyIv: iv,
      systemPrompt: data.systemPrompt,
      temperature: data.temperature ?? 0.7,
      maxTokensPerTurn: data.maxTokensPerTurn ?? 4096,
      maxTurns: data.maxTurns ?? 20,
      dailyTokenBudget: data.dailyTokenBudget,
      maxConcurrentTasks: data.maxConcurrentTasks ?? 1,
      avatarUrl: data.avatarUrl,
      jobTitle: data.jobTitle,
      department: data.department,
      capabilities: data.capabilities?.length
        ? { create: data.capabilities.map((name) => ({ name })) }
        : undefined,
    },
    include: { capabilities: true, toolGrants: { include: { tool: true } } },
  });

  return agent;
}

export async function updateAgent(id: string, userId: string, data: Record<string, unknown>) {
  await getAgent(id, userId); // ownership check

  const updateData: Record<string, unknown> = { ...data };
  if (data.apiKey) {
    const { encrypted, iv } = encrypt(data.apiKey as string);
    updateData.encryptedApiKey = encrypted;
    updateData.apiKeyIv = iv;
    delete updateData.apiKey;
  }

  return prisma.agentRegistration.update({
    where: { id },
    data: updateData as any,
    include: { capabilities: true, toolGrants: { include: { tool: true } } },
  });
}

export async function deleteAgent(id: string, userId: string) {
  await getAgent(id, userId);
  await prisma.agentRegistration.delete({ where: { id } });
}

export async function setAgentStatus(id: string, userId: string, enable: boolean) {
  await getAgent(id, userId);
  return prisma.agentRegistration.update({
    where: { id },
    data: { status: enable ? 'IDLE' : 'DISABLED' },
  });
}

export async function grantTool(agentId: string, userId: string, toolId: string, config?: Record<string, unknown>) {
  await getAgent(agentId, userId);
  return prisma.agentToolGrant.upsert({
    where: { agentId_toolId: { agentId, toolId } },
    update: { config: (config ?? undefined) as any },
    create: { agentId, toolId, config: (config ?? undefined) as any },
  });
}

export async function revokeTool(agentId: string, userId: string, toolId: string) {
  await getAgent(agentId, userId);
  await prisma.agentToolGrant.delete({
    where: { agentId_toolId: { agentId, toolId } },
  });
}

// ── Provider import helpers ────────────────────────────────────────────────────

export async function listProviderAgents(provider: string, apiKey: string) {
  const providerKey = provider.toLowerCase() as ProviderKey;
  const importer = getImporter(providerKey);
  if (!importer) return [];
  return importer.listImportableAgents(apiKey);
}

export async function listProviderModels(provider: string, apiKey: string) {
  const providerKey = provider.toLowerCase() as ProviderKey;
  const importer = getImporter(providerKey);
  if (!importer) return [];
  return importer.listAvailableModels(apiKey);
}

export function decryptApiKey(agent: { encryptedApiKey: string; apiKeyIv: string }): string {
  return decrypt(agent.encryptedApiKey, agent.apiKeyIv);
}
