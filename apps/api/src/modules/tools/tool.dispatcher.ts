import { webSearchTool } from './implementations/web-search.tool';
import { httpRequestTool } from './implementations/http-request.tool';
import { codeExecutionTool } from './implementations/code-execution.tool';
import { requestHireTool } from './implementations/request-hire.tool';
import { memoryStoreTool } from './implementations/memory-store.tool';
import { memoryRecallTool } from './implementations/memory-recall.tool';
import { requestHumanInputTool, checkHumanReplyTool } from './implementations/request-human-input.tool';
import { delegateTaskTool, checkDelegatedTaskTool } from './implementations/delegate-task.tool';

type ToolHandler = (input: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown>;

const toolRegistry: Record<string, ToolHandler> = {
  web_search: webSearchTool,
  http_request: httpRequestTool,
  code_execution: codeExecutionTool,
  request_hire: (input, ctx) => requestHireTool(input, ctx as any),
  store_memory: memoryStoreTool,
  recall_memory: memoryRecallTool,
  request_human_input: requestHumanInputTool,
  check_human_reply: checkHumanReplyTool,
  delegate_task: delegateTaskTool,
  check_delegated_task: checkDelegatedTaskTool,
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context?: { agentId: string; projectId: string },
): Promise<unknown> {
  const handler = toolRegistry[name];
  if (!handler) throw new Error(`Tool "${name}" has no implementation`);
  return handler(input, context as any);
}
