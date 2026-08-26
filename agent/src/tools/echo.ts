/**
 * agent.echo — tool de lifecycle (no filesystem/shell).
 * Fuente de verdad de name / description / inputSchema.
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const AGENT_ECHO_NAME = "agent.echo";

export const AGENT_ECHO_DESCRIPTION =
  "Echo del Agent local. Devuelve el texto recibido.";

export const AGENT_ECHO_INPUT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

export const agentEchoTool: AgentTool = {
  name: AGENT_ECHO_NAME,
  description: AGENT_ECHO_DESCRIPTION,
  inputSchema: AGENT_ECHO_INPUT_SCHEMA,
  executionMode: "automatic",
  async execute(input): Promise<ToolResult> {
    if (
      typeof input !== "object" ||
      input === null ||
      !("text" in input) ||
      typeof (input as { text: unknown }).text !== "string"
    ) {
      return {
        ok: false,
        error: {
          code: "invalid_input",
          message: "Se espera { text: string }.",
        },
      };
    }
    return { ok: true, content: { text: (input as { text: string }).text } };
  },
};

/** Alias de la definición (name/description/inputSchema). */
export const AGENT_ECHO = {
  name: agentEchoTool.name,
  description: agentEchoTool.description,
  inputSchema: agentEchoTool.inputSchema,
} as const;

