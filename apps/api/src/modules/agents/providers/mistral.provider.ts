import MistralLib from '@mistralai/mistralai';
const Mistral = MistralLib as any;
import type {
  IAgentProvider, AgentConfig, ExecutionContext,
  AgentRunResult, AgentTurn, ToolDefinition,
} from './provider.interface';

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  'mistral-large-latest':  { prompt: 0.000003, completion: 0.000009 },
  'mistral-medium-latest': { prompt: 0.0000027, completion: 0.0000081 },
  'mistral-small-latest':  { prompt: 0.000002, completion: 0.000006 },
  'open-mixtral-8x7b':    { prompt: 0.0000007, completion: 0.0000007 },
  'open-mistral-7b':      { prompt: 0.00000025, completion: 0.00000025 },
};

function toMistralTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

export class MistralProvider implements IAgentProvider {
  private client(apiKey: string) {
    return new Mistral({ apiKey });
  }

  async run(config: AgentConfig, ctx: ExecutionContext): Promise<AgentRunResult> {
    const client = this.client(config.apiKey);
    let promptTokens = 0;
    let completionTokens = 0;
    let turns = 0;

    const messages: any[] = [
      ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
      ...ctx.messages.map((m) => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId, name: m.toolName ?? '' } : {}),
      })),
    ];

    const tools = ctx.tools.length > 0 ? toMistralTools(ctx.tools) : undefined;
    let finalOutput = '';

    while (turns < ctx.maxTurns) {
      const resp = await client.chat.complete({
        model: config.modelId,
        messages,
        tools,
        toolChoice: tools ? 'auto' : undefined,
        temperature: config.temperature,
        maxTokens: config.maxTokensPerTurn,
      });

      turns++;
      const choice = resp.choices?.[0];
      if (!choice) break;

      promptTokens += resp.usage?.promptTokens ?? 0;
      completionTokens += resp.usage?.completionTokens ?? 0;

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      const toolCalls = Array.isArray(assistantMsg.toolCalls) ? assistantMsg.toolCalls : [];

      const turn: AgentTurn = {
        role: 'assistant',
        content: typeof assistantMsg.content === 'string' ? assistantMsg.content : '',
        toolCalls: toolCalls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          input: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : tc.function.arguments ?? {},
        })),
        finishReason: choice.finishReason === 'tool_calls' ? 'tool_use'
          : choice.finishReason === 'stop' ? 'stop' : 'max_tokens',
      };

      await ctx.onTurn(turn);

      if (choice.finishReason === 'stop' || !toolCalls.length) {
        finalOutput = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
        break;
      }

      for (const tc of toolCalls) {
        const result = await ctx.onToolCall({
          id: tc.id,
          name: tc.function.name,
          input: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : tc.function.arguments ?? {},
        });
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          name: tc.function.name,
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
      const client = this.client(apiKey);
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(promptTokens: number, completionTokens: number, modelId: string): number {
    const rates = MODEL_COSTS[modelId] ?? { prompt: 0.000003, completion: 0.000009 };
    return promptTokens * rates.prompt + completionTokens * rates.completion;
  }
}
