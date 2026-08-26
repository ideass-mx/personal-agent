/**
 * Representación interna actual de una Tool (temporal).
 * No es el catálogo global de la plataforma.
 * Mezcla: descriptor LLM, executionMode (confirmación) y execute.
 * En producción execute es RemoteAgentTool → MCP Adapter.
 */

/** JSON Schema-compatible (objeto serializable). Sin Zod. */
export type JsonSchema = Record<string, unknown>;

export interface ToolContext {
  conversationId: string;
  deviceId?: string;
}

export type ToolResult =
  | { ok: true; content: unknown }
  | { ok: false; error: { code: string; message: string } };

/**
 * Cómo debe ejecutarse la tool.
 * - automatic: se ejecuta de inmediato
 * - confirm: requiere autorización del usuario (flujo real: etapa posterior)
 */
export type ToolExecutionMode = "automatic" | "confirm";

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  executionMode: ToolExecutionMode;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
