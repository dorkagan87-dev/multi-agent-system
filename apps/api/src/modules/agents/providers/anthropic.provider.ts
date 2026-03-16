import Anthropic from '@anthropic-ai/sdk';
import type {
  IAgentProvider, IAgentImporter, AgentConfig, ExecutionContext,
  AgentRunResult, AgentTurn, ImportedAssistant, ToolDefinition,
} from './provider.interface';

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  'claude-opus-4-6':    { prompt: 0.000015, completion: 0.000075 },
  'claude-sonnet-4-6':  { prompt: 0.000003, completion: 0.000015 },
  'claude-haiku-4-5-20251001': { prompt: 0.00000025, completion: 0.00000125 },
};

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));
}

export class AnthropicProvider implements IAgentProvider, IAgentImporter {
  private client(apiKey: string) {
    return new Anthropic({ apiKey });
  }

  async run(config: AgentConfig, ctx: ExecutionContext): Promise<AgentRunResult> {
    const client = this.client(config.apiKey);
    let promptTokens = 0;
    let completionTokens = 0;
    let turns = 0;
    let finalOutput = '';

    // Anthropic uses a separate system param
    const messages: Anthropic.MessageParam[] = ctx.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const tools = ctx.tools.length > 0 ? toAnthropicTools(ctx.tools) : undefined;

    while (turns < ctx.maxTurns) {
      const resp = await client.messages.create({
        model: config.modelId,
        system: config.systemPrompt,
        messages,
        tools,
        max_tokens: config.maxTokensPerTurn,
        temperature: config.temperature,
      });

      turns++;
      promptTokens += resp.usage.input_tokens;
      completionTokens += resp.usage.output_tokens;

      const textContent = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const toolUseBlocks = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const turn: AgentTurn = {
        role: 'assistant',
        content: textContent,
        toolCalls: toolUseBlocks.map((tb) => ({
          id: tb.id,
          name: tb.name,
          input: tb.input as Record<string, unknown>,
        })),
        finishReason: resp.stop_reason === 'tool_use' ? 'tool_use'
          : resp.stop_reason === 'end_turn' ? 'stop' : 'max_tokens',
      };

      await ctx.onTurn(turn);

      // Append assistant turn to messages
      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'max_tokens' && toolUseBlocks.length === 0) {
        // Output was truncated — ask the model to continue from where it left off
        messages.push({ role: 'user', content: 'Continue exactly from where you left off. Do not repeat anything.' });
        continue;
      }

      if (resp.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        finalOutput = textContent;
        break;
      }

      // Execute tools and build tool result message
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        const result = await ctx.onToolCall({
          id: tb.id,
          name: tb.name,
          input: tb.input as Record<string, unknown>,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: 'user', content: toolResults });
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

  // ── Import from Anthropic — list available models ───────────────────────────
  // Anthropic does not have a "saved agents" concept, so we surface available models

  async listImportableAgents(_apiKey: string): Promise<ImportedAssistant[]> {
    // Anthropic has no saved assistants to import — return empty
    return [];
  }

  async listAvailableModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
    try {
      const client = this.client(apiKey);
      const models = await client.models.list();
      return models.data.map((m) => ({
        id: m.id,
        displayName: m.display_name ?? m.id,
      }));
    } catch {
      // Fallback to known models
      return [
        { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
        { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
        { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
      ];
    }
  }
}
