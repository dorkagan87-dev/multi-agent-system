import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import axios from 'axios';
import type {
  IAgentProvider, IAgentImporter, AgentConfig, ExecutionContext,
  AgentRunResult, AgentTurn, ImportedAssistant, ToolDefinition,
} from './provider.interface';

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  'gemini-2.0-flash':     { prompt: 0.0000001, completion: 0.0000004 },
  'gemini-1.5-pro':       { prompt: 0.00000125, completion: 0.000005 },
  'gemini-1.5-flash':     { prompt: 0.000000075, completion: 0.0000003 },
};

export class GoogleProvider implements IAgentProvider, IAgentImporter {
  private client(apiKey: string) {
    return new GoogleGenerativeAI(apiKey);
  }

  async run(config: AgentConfig, ctx: ExecutionContext): Promise<AgentRunResult> {
    const genAI = this.client(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.modelId,
      systemInstruction: config.systemPrompt,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokensPerTurn,
      },
    });

    const tools: any[] = ctx.tools.length > 0
      ? [{ functionDeclarations: ctx.tools.map((t: ToolDefinition) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })) }]
      : [];

    const history = ctx.messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const lastMsg = ctx.messages[ctx.messages.length - 1];
    const chat = model.startChat({ history, tools });

    let promptTokens = 0;
    let completionTokens = 0;
    let turns = 0;
    let finalOutput = '';
    let currentMsg = lastMsg?.content ?? '';

    while (turns < ctx.maxTurns) {
      const result = await chat.sendMessage(currentMsg);
      turns++;

      const response = result.response;
      const text = response.text();
      promptTokens += response.usageMetadata?.promptTokenCount ?? 0;
      completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

      const fnCalls = response.functionCalls() ?? [];

      const turn: AgentTurn = {
        role: 'assistant',
        content: text,
        toolCalls: fnCalls.map((fc) => ({
          id: fc.name,
          name: fc.name,
          input: fc.args as Record<string, unknown>,
        })),
        finishReason: fnCalls.length > 0 ? 'tool_use' : 'stop',
      };
      await ctx.onTurn(turn);

      if (fnCalls.length === 0) {
        finalOutput = text;
        break;
      }

      // Execute tools
      const toolResultParts: any[] = [];
      for (const fc of fnCalls) {
        const result2 = await ctx.onToolCall({ id: fc.name, name: fc.name, input: fc.args as Record<string, unknown> });
        toolResultParts.push({
          functionResponse: { name: fc.name, response: { output: result2.content } },
        });
      }
      // Feed tool results back
      currentMsg = toolResultParts as any;
    }

    return {
      promptTokens, completionTokens, turns, finalOutput,
      cost: this.estimateCost(promptTokens, completionTokens, config.modelId),
    };
  }

  async validateCredentials(apiKey: string): Promise<boolean> {
    try {
      const genAI = this.client(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('ping');
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(promptTokens: number, completionTokens: number, modelId: string): number {
    const rates = MODEL_COSTS[modelId] ?? { prompt: 0.00000125, completion: 0.000005 };
    return promptTokens * rates.prompt + completionTokens * rates.completion;
  }

  async listImportableAgents(_apiKey: string): Promise<ImportedAssistant[]> {
    return []; // Google AI Studio has no saved assistants concept
  }

  async listAvailableModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
    try {
      const resp = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      return (resp.data.models ?? [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          displayName: m.displayName ?? m.name,
        }));
    } catch {
      return [
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      ];
    }
  }
}
