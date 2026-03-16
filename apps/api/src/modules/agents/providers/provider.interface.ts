export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResult = {
  toolCallId: string;
  content: string;
  isError?: boolean;
};

export type AgentTurn = {
  role: 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
};

export type ExecutionContext = {
  taskId: string;
  executionId: string;
  messages: Message[];
  tools: ToolDefinition[];
  onTurn: (turn: AgentTurn) => Promise<void>;
  onToolCall: (call: ToolCall) => Promise<ToolResult>;
  maxTurns: number;
};

export type AgentConfig = {
  modelId: string;
  apiKey: string; // already decrypted
  systemPrompt?: string;
  temperature: number;
  maxTokensPerTurn: number;
};

export type AgentRunResult = {
  promptTokens: number;
  completionTokens: number;
  turns: number;
  finalOutput: string;
  cost: number;
};

export interface IAgentProvider {
  run(config: AgentConfig, context: ExecutionContext): Promise<AgentRunResult>;
  validateCredentials(apiKey: string): Promise<boolean>;
  estimateCost(promptTokens: number, completionTokens: number, modelId: string): number;
}

// ── Import types (fetching available agents/models from each provider) ──────────

export type ImportedAssistant = {
  providerAgentId: string;
  name: string;
  description: string | null;
  modelId: string;
  systemPrompt: string | null;
  tools: string[];
};

export interface IAgentImporter {
  listImportableAgents(apiKey: string): Promise<ImportedAssistant[]>;
  listAvailableModels(apiKey: string): Promise<{ id: string; displayName: string }[]>;
}
