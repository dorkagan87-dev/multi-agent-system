import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const BUILT_IN_TOOLS: Array<{
  name: string; displayName: string; description: string;
  type: 'WEB_SEARCH' | 'HTTP_REQUEST' | 'CODE_EXECUTION' | 'CUSTOM';
  requiresSandbox: boolean; inputSchema: Record<string, unknown>;
}> = [
  {
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the web for current information using DuckDuckGo.',
    type: 'WEB_SEARCH' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query' } },
      required: ['query'],
    },
  },
  {
    name: 'http_request',
    displayName: 'HTTP Request',
    description: 'Make an HTTP GET or POST request to an external API endpoint.',
    type: 'HTTP_REQUEST' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to request' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
        headers: { type: 'object', description: 'Request headers', additionalProperties: { type: 'string' } },
        body: { description: 'Request body (for POST/PUT)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'request_hire',
    displayName: 'Request Hire',
    description: 'Request that a new specialist agent be hired for a role you cannot fill. Creates a hiring request for admin approval.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'The job title of the specialist needed (e.g. "Senior Data Scientist")' },
        department: { type: 'string', description: 'The department (e.g. "Analytics", "Engineering")' },
        skills: { type: 'array', items: { type: 'string' }, description: 'List of required skills' },
        reason: { type: 'string', description: 'Why this specialist is needed for the current project' },
      },
      required: ['role', 'department', 'reason'],
    },
  },
  {
    name: 'code_execution',
    displayName: 'Code Execution',
    description: 'Execute Python or JavaScript code and return the output.',
    type: 'CODE_EXECUTION' as const,
    requiresSandbox: true,
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['python', 'javascript'], description: 'Programming language' },
        code: { type: 'string', description: 'The code to execute' },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'store_memory',
    displayName: 'Store Memory',
    description: 'Store a piece of information in your persistent memory for future tasks.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short identifier for this memory (snake_case)' },
        content: { type: 'string', description: 'The information to remember' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to categorize this memory' },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'recall_memory',
    displayName: 'Recall Memory',
    description: 'Search your persistent memory for information relevant to a query.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memory' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'request_human_input',
    displayName: 'Request Human Input',
    description: 'Pause and ask a human operator a question when you hit ambiguity or need a decision. Returns a question ID — use check_human_reply to get the answer.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the human operator' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'How urgent this question is' },
      },
      required: ['question'],
    },
  },
  {
    name: 'check_human_reply',
    displayName: 'Check Human Reply',
    description: 'Check if a human operator has replied to a previously submitted question.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'The question ID returned by request_human_input' },
      },
      required: ['questionId'],
    },
  },
  {
    name: 'delegate_task',
    displayName: 'Delegate Task',
    description: 'Create and queue a sub-task to be handled by another agent. Returns a task ID — use check_delegated_task to get the result.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the task to delegate' },
        description: { type: 'string', description: 'Detailed instructions for the delegated task' },
        agentId: { type: 'string', description: 'ID of the agent to assign the task to (optional — auto-assigns if omitted)' },
        acceptanceCriteria: { type: 'string', description: 'What constitutes a successful completion' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Task priority (default: MEDIUM)' },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'check_delegated_task',
    displayName: 'Check Delegated Task',
    description: 'Check the status and result of a task you previously delegated to another agent.',
    type: 'CUSTOM' as const,
    requiresSandbox: false,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID returned by delegate_task' },
      },
      required: ['taskId'],
    },
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  for (const tool of BUILT_IN_TOOLS) {
    await prisma.tool.upsert({
      where: { name: tool.name },
      update: tool,
      create: tool,
    });
    console.log(`  ✓ Tool: ${tool.displayName}`);
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
