import { CohereClientV2 } from 'cohere-ai';
import type {
  IAgentProvider, AgentConfig, ExecutionContext,
  AgentRunResult, AgentTurn, ToolDefinition,
} from './provider.interface';

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  'command-r-plus': { prompt: 0.000003, completion: 0.000015 },
  'command-r':      { prompt: 0.0000005, completion: 0.0000015 },
  'command':        { prompt: 0.000001, completion: 0.000002 },
};

function toCohereTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

export class CohereProvider implements IAgentProvider {
  private client(apiKey: string) {
    return new CohereClientV2({ token: apiKey });
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
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
    ];

    const tools = ctx.tools.length > 0 ? toCohereTools(ctx.tools) : undefined;
    let finalOutput = '';

    while (turns < ctx.maxTurns) {
      const resp = await client.chat({
        model: config.modelId,
        messages,
        tools,
        temperature: config.temperature,
        maxTokens: config.maxTokensPerTurn,
      });

      turns++;
      const choice = resp.message;
      if (!choice) break;

      promptTokens += resp.usage?.tokens?.inputTokens ?? 0;
      completionTokens += resp.usage?.tokens?.outputTokens ?? 0;

      const content = Array.isArray(choice.content) ? choice.content : [];
      const textContent = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      const toolUseContent = content.filter((c: any) => c.type === 'tool_use');

      messages.push({ role: 'assistant', content });

      const turn: AgentTurn = {
        role: 'assistant',
        content: textContent,
        toolCalls: toolUseContent.map((tc: any) => ({
          id: tc.id,
          name: tc.name,
          input: tc.input ?? {},
        })),
        finishReason: resp.finishReason === 'TOOL_CALL' ? 'tool_use'
          : resp.finishReason === 'COMPLETE' ? 'stop' : 'max_tokens',
      };

      await ctx.onTurn(turn);

      if (resp.finishReason === 'COMPLETE' || !toolUseContent.length) {
        finalOutput = textContent;
        break;
      }

      for (const tc of toolUseContent) {
        const result = await ctx.onToolCall({ id: (tc as any).id, name: (tc as any).name, input: (tc as any).input ?? {} });
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: [{ type: 'tool_result', tool_use_id: result.toolCallId, content: result.content }],
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
    const rates = MODEL_COSTS[modelId] ?? { prompt: 0.000003, completion: 0.000015 };
    return promptTokens * rates.prompt + completionTokens * rates.completion;
  }
}
