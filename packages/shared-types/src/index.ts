// ── Enums ──────────────────────────────────────────────────────────────────────

export type AgentProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere' | 'custom';
export type AgentStatus = 'idle' | 'busy' | 'error' | 'disabled' | 'rate_limited';
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ToolType = 'web_search' | 'code_execution' | 'file_system' | 'http_request' | 'database_query' | 'email' | 'custom';
export type MemoryScope = 'agent_global' | 'project' | 'task';
export type UserRole = 'admin' | 'member' | 'viewer';

// ── User DTOs ──────────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
}

// ── Agent DTOs ─────────────────────────────────────────────────────────────────

export interface AgentDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  provider: AgentProvider;
  modelId: string;
  status: AgentStatus;
  systemPrompt: string | null;
  temperature: number;
  maxTokensPerTurn: number;
  maxTurns: number;
  dailyTokenBudget: number | null;
  tokensUsedToday: number;
  maxConcurrentTasks: number;
  currentTaskCount: number;
  capabilities: string[];
  tools: ToolGrantDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentDto {
  name: string;
  description?: string;
  provider: AgentProvider;
  modelId: string;
  apiKey: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokensPerTurn?: number;
  maxTurns?: number;
  dailyTokenBudget?: number;
  maxConcurrentTasks?: number;
  capabilities?: string[];
}

export interface UpdateAgentDto extends Partial<Omit<CreateAgentDto, 'provider'>> {}

// ── Tool DTOs ──────────────────────────────────────────────────────────────────

export interface ToolDto {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: ToolType;
  inputSchema: Record<string, unknown>;
  requiresSandbox: boolean;
  isBuiltIn: boolean;
}

export interface ToolGrantDto {
  toolId: string;
  toolName: string;
  toolDisplayName: string;
  config: Record<string, unknown> | null;
  grantedAt: string;
}

// ── Project DTOs ───────────────────────────────────────────────────────────────

export interface ProjectDto {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  goal: string;
  status: ProjectStatus;
  deadline: string | null;
  completedAt: string | null;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  goal: string;
  deadline?: string;
}

export interface UpdateProjectDto extends Partial<CreateProjectDto> {}

// ── Task DTOs ──────────────────────────────────────────────────────────────────

export interface TaskDto {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  acceptanceCriteria: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  maxRetries: number;
  retryCount: number;
  scheduledAt: string | null;
  deadline: string | null;
  output: Record<string, unknown> | null;
  outputSummary: string | null;
  subTasks: TaskDto[];
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateTaskDto {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependsOn?: string[];
  scheduledAt?: string;
  deadline?: string;
  maxRetries?: number;
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {}

// ── Execution & Log DTOs ───────────────────────────────────────────────────────

export interface TaskExecutionDto {
  id: string;
  taskId: string;
  agentId: string;
  agentName: string;
  attempt: number;
  status: TaskStatus;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  turns: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ExecutionLogDto {
  id: string;
  executionId: string;
  level: 'info' | 'warn' | 'error' | 'tool_call' | 'tool_result' | 'llm_turn' | 'agent_message';
  message: string;
  data: Record<string, unknown> | null;
  timestamp: string;
}

// ── Memory DTOs ────────────────────────────────────────────────────────────────

export interface AgentMemoryDto {
  id: string;
  agentId: string;
  projectId: string | null;
  scope: MemoryScope;
  key: string;
  value: unknown;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Dashboard DTOs ─────────────────────────────────────────────────────────────

export interface DashboardStatsDto {
  totalAgents: number;
  activeAgents: number;
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasksToday: number;
  failedTasksToday: number;
  runningTasks: number;
  tokensUsedToday: number;
  estimatedCostToday: number;
}

// ── Socket.io Event Payloads ───────────────────────────────────────────────────

export interface SocketEvents {
  'task:status_changed': { taskId: string; projectId: string; status: TaskStatus; agentId: string | null };
  'task:log_appended': { executionId: string; log: ExecutionLogDto };
  'agent:status_changed': { agentId: string; status: AgentStatus };
  'agent:token_usage': { agentId: string; promptTokens: number; completionTokens: number; cost: number };
  'project:progress': { projectId: string; completedTasks: number; totalTasks: number };
  'agent:message': { fromAgentId: string; fromAgentName: string; toAgentId: string | null; projectId: string; message: string; timestamp: string };
  'queue:stats': { depth: number; activeJobs: number; failedJobs: number; completedJobs: number };
}

// ── Agent-to-Agent Message DTOs ────────────────────────────────────────────────

export interface AgentMessageDto {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string | null; // null = broadcast to project room
  projectId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

// ── Provider Import DTOs (for importing existing agents) ───────────────────────

export interface OpenAIAssistantImport {
  assistantId: string;
  name: string;
  model: string;
  instructions: string | null;
  tools: string[];
}

export interface AnthropicModelInfo {
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
}

export interface GoogleModelInfo {
  modelId: string;
  displayName: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

// ── Pagination ─────────────────────────────────────────────────────────────────

export interface PaginatedDto<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}
