import OpenAI from 'openai';
import type {
  IAgentProvider, IAgentImporter, AgentConfig, ExecutionContext,
  AgentRunResult, AgentTurn, ImportedAssistant, ToolDefinition,
} from './provider.interface';

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o':           { prompt: 0.0000025, completion: 0.00001 },
  'gpt-4o-mini':      { prompt: 0.00000015, completion: 0.0000006 },
  'gpt-4-turbo':      { prompt: 0.00001, completion: 0.00003 },
  'gpt-3.5-turbo':    { prompt: 0.0000005, completion: 0.0000015 },
};

function toOpenAITools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

export class OpenAIProvider implements IAgentProvider, IAgentImporter {
  private client(apiKey: string) {
    return new OpenAI({ apiKey });
  }

  async run(config: AgentConfig, ctx: ExecutionContext): Promise<AgentRunResult> {
    const oai = this.client(config.apiKey);
    let promptTokens = 0;
    let completionTokens = 0;
    let turns = 0;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(config.systemPrompt ? [{ role: 'system' as const, content: config.systemPrompt }] : []),
      ...ctx.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'tool',
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })) as OpenAI.Chat.ChatCompletionMessageParam[],
    ];

    const tools = ctx.tools.length > 0 ? toOpenAITools(ctx.tools) : undefined;
    let finalOutput = '';

    while (turns < ctx.maxTurns) {
      const resp = await oai.chat.completions.create({
        model: config.modelId,
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        temperature: config.temperature,
        max_tokens: config.maxTokensPerTurn,
      });

      turns++;
      const choice = resp.choices[0];
      promptTokens += resp.usage?.prompt_tokens ?? 0;
      completionTokens += resp.usage?.completion_tokens ?? 0;

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      const turn: AgentTurn = {
        role: 'assistant',
        content: assistantMsg.content ?? '',
        toolCalls: assistantMsg.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        })),
        finishReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
          : choice.finish_reason === 'stop' ? 'stop' : 'max_tokens',
      };

      await ctx.onTurn(turn);

      if (choice.finish_reason === 'length' && !assistantMsg.tool_calls?.length) {
        // Truncated — continue
        messages.push({ role: 'user', content: 'Continue exactly from where you left off. Do not repeat anything.' });
        continue;
      }

      if (choice.finish_reason === 'stop' || !assistantMsg.tool_calls?.length) {
        finalOutput = assistantMsg.content ?? '';
        break;
      }

      // Execute tool calls
      for (const tc of assistantMsg.tool_calls ?? []) {
        const result = await ctx.onToolCall({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.content,
        });
      }
    }

    return {
      promptTokens,
      completionTokens,
      turns,
      finalOutput,
      cost: this.estimateCost(promptTokens, completionTokens, config.modelId),
    };
  }

  async validateCredentials(apiKey: string): Promise<boolean> {
    try {
      const oai = this.client(apiKey);
      await oai.models.list();
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(promptTokens: number, completionTokens: number, modelId: string): number {
    const rates = MODEL_COSTS[modelId] ?? { prompt: 0.00001, completion: 0.00003 };
    return promptTokens * rates.prompt + completionTokens * rates.completion;
  }

  // ── Import from OpenAI platform ──────────────────────────────────────────────

  async listImportableAgents(apiKey: string): Promise<ImportedAssistant[]> {
    const oai = this.client(apiKey);
    const assistants = await oai.beta.assistants.list({ limit: 100 });
    return assistants.data.map((a) => ({
      providerAgentId: a.id,
      name: a.name ?? a.id,
      description: a.description ?? null,
      modelId: a.model,
      systemPrompt: a.instructions ?? null,
      tools: a.tools.map((t) => t.type),
    }));
  }

  async listAvailableModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
    const oai = this.client(apiKey);
    const models = await oai.models.list();
    return models.data
      .filter((m) => m.id.startsWith('gpt'))
      .sort((a, b) => b.created - a.created)
      .map((m) => ({ id: m.id, displayName: m.id }));
  }
}
