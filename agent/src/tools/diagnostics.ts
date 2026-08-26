/**
 * diagnostics.ping — eco mínimo y determinista.
 * Sin filesystem, spawn, red, variables de entorno ni secretos.
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const DIAGNOSTICS_PING_NAME = "diagnostics.ping";

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const diagnosticsPingTool: AgentTool = {
  name: DIAGNOSTICS_PING_NAME,
  description: "Ping de diagnóstico. Devuelve { pong: true }.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  /**
   * Campo legado del AgentTool. El Hub lo ignora: executionMode
   * lo decide la Tool Policy del Hub (diagnostics.ping → automatic).
   */
  executionMode: "confirm",
  async execute(): Promise<ToolResult> {
    return { ok: true, content: { pong: true } };
  },
};
