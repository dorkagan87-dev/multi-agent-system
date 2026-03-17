import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

const client = new Anthropic();

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      m !== null &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      typeof m.timestamp === 'string',
  );
}

export async function getChatOrCreate(
  contractId: string,
): Promise<{ id: string; messages: ChatMessage[] }> {
  let chat = await prisma.contractChat.findFirst({ where: { contractId } });
  if (!chat) {
    chat = await prisma.contractChat.create({ data: { contractId, messages: [] } });
  }
  return { id: chat.id, messages: sanitizeMessages(chat.messages) };
}

export async function sendChatMessage(
  contractId: string,
  userMessage: string,
): Promise<ChatMessage> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { analysis: true },
  });

  if (!contract?.analysis) {
    throw Object.assign(new Error('Contract analysis not available yet'), { status: 404 });
  }

  const systemPrompt = `You are a contract analyst assistant. A contract has been analyzed with the following results:

Risk Score: ${contract.analysis.riskScore}/100
Summary: ${contract.analysis.summary}
Red Flags: ${JSON.stringify(contract.analysis.redFlags)}
Clauses: ${JSON.stringify(contract.analysis.clauses)}
Missing Clauses: ${JSON.stringify(contract.analysis.missingClauses)}

Answer the user's questions about this contract clearly and concisely. Only reference information present in the analysis above.`;

  const { id: chatId, messages } = await getChatOrCreate(contractId);

  const history = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');

  const userMsg: ChatMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: block.text,
    timestamp: new Date().toISOString(),
  };

  await prisma.contractChat.update({
    where: { id: chatId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { messages: [...messages, userMsg, assistantMsg] as any },
  });

  logger.info({ contractId, chatId }, '[ContractChat] Message sent');
  return assistantMsg;
}
