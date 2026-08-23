/**
 * Contrato mínimo de herramientas del agente.
 * Sin permisos, OAuth, plugins ni adaptadores externos — solo execute + resultado.
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

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
