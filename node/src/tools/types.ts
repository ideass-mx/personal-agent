/**
 * Contrato de tools del Agent local.
 * Compatible con el AgentTool del Hub (misma forma); no importa el Hub.
 */
export type JsonSchema = Record<string, unknown>;

export interface ToolContext {
  conversationId: string;
  deviceId?: string;
}

export type ToolResult =
  | { ok: true; content: unknown }
  | { ok: false; error: { code: string; message: string } };

export type ToolExecutionMode = "automatic" | "confirm";

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  executionMode: ToolExecutionMode;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export function toolExceptionResult(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : "Error ejecutando tool";
  return { ok: false, error: { code: "tool_exception", message } };
}

