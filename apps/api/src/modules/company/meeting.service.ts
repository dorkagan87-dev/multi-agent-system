/**
 * Meeting Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Allows agents to hold synchronous "meetings" — multi-agent round-robin
 * conversations where each agent contributes based on their role/expertise.
 *
 * Use cases:
 *  - CEO calls a meeting to align on strategy
 *  - Dev + Analyst discuss technical approach
 *  - Marketing + Design brainstorm a campaign
 *
 * Each meeting is stored as a sequence of AgentMessages with metadata.type = 'meeting'.
 */
import { prisma } from '../../config/database';
import { getProvider } from '../agents/providers/registry';
import { decryptApiKey } from '../agents/agents.service';
import { publishEvent } from '../events/events.service';
import { logger } from '../../utils/logger';

export interface MeetingConfig {
  projectId: string;
  topic: string;
  agentIds: string[]; // participating agents (in speaking order)
  rounds: number;     // how many times each agent speaks
  callerId: string;   // who called the meeting
}

export interface MeetingResult {
  meetingId: string;
  transcript: Array<{ agentId: string; agentName: string; content: string; timestamp: string }>;
  decision: string | null; // extracted consensus/decision if any
}

export async function runMeeting(config: MeetingConfig): Promise<MeetingResult> {
  const meetingId = `meeting-${Date.now()}`;
  const transcript: MeetingResult['transcript'] = [];

  const agents = await prisma.agentRegistration.findMany({
    where: { id: { in: config.agentIds } },
  });

  if (agents.length < 2) throw new Error('Meeting requires at least 2 agents');

  logger.info({ meetingId, topic: config.topic, agents: agents.map((a) => a.name) }, 'Meeting started');

  // Announce meeting
  for (const agent of agents) {
    await publishEvent('agent:message', {
      fromAgentId: config.callerId,
      fromAgentName: agents.find((a) => a.id === config.callerId)?.name ?? 'System',
      toAgentId: null,
      projectId: config.projectId,
      message: `📅 Meeting called: **${config.topic}** — participants: ${agents.map((a) => a.name).join(', ')}`,
      timestamp: new Date().toISOString(),
    });
    break;
  }

  // Build conversation history across all agents
  const sharedHistory: Array<{ speaker: string; content: string }> = [];

  for (let round = 0; round < config.rounds; round++) {
    for (const agent of agents) {
      const provider = getProvider(agent.provider.toLowerCase() as any);
      const apiKey = decryptApiKey(agent);

      const contextMessages = sharedHistory.map((h) => ({
        role: 'user' as const,
        content: `${h.speaker}: ${h.content}`,
      }));

      const systemPrompt = `${agent.systemPrompt ?? ''}

You are ${agent.name}, ${agent.jobTitle ?? 'an AI agent'} at AgentHub Corp.
You are in a company meeting about: "${config.topic}"
Be concise (2-4 sentences). Contribute your expertise. Build on what others have said.
If this is round ${round + 1} of ${config.rounds} and you're the last speaker, propose a concrete decision or next action.`;

      let response = '';
      await provider.run(
        {
          modelId: agent.modelId,
          apiKey,
          systemPrompt,
          temperature: 0.7,
          maxTokensPerTurn: 512,
        },
        {
          taskId: meetingId,
          executionId: `${meetingId}-${agent.id}-${round}`,
          messages: [
            ...contextMessages,
            { role: 'user', content: round === 0 && contextMessages.length === 0
              ? `The meeting topic is: ${config.topic}. Please share your perspective.`
              : 'Your turn to respond.' },
          ],
          tools: [],
          maxTurns: 1,
          onTurn: async (turn) => { response = turn.content; },
          onToolCall: async () => ({ toolCallId: '', content: '' }),
        }
      );

      if (!response) continue;

      sharedHistory.push({ speaker: agent.name, content: response });
      transcript.push({ agentId: agent.id, agentName: agent.name, content: response, timestamp: new Date().toISOString() });

      // Persist and broadcast each message
      await prisma.agentMessage.create({
        data: {
          fromAgentId: agent.id,
          projectId: config.projectId,
          content: response,
          metadata: { type: 'meeting', meetingId, round, topic: config.topic },
        },
      });

      await publishEvent('agent:message', {
        fromAgentId: agent.id,
        fromAgentName: agent.name,
        toAgentId: null,
        projectId: config.projectId,
        message: response,
        timestamp: new Date().toISOString(),
      });

      // Small delay between speakers for readability in UI
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Extract decision from last message
  const lastMsg = transcript[transcript.length - 1];
  const decision = lastMsg?.content ?? null;

  logger.info({ meetingId, turns: transcript.length }, 'Meeting complete');
  return { meetingId, transcript, decision };
}
