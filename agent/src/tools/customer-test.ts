/**
 * customer.test — tool de prueba 13B (capacidad extra del bundle customer).
 * El Agent la anuncia; la Tool Policy del Hub decide si se habilita.
 * Sin filesystem, spawn, red ni secretos.
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const CUSTOMER_TEST_NAME = "customer.test";

const MESSAGE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
  additionalProperties: false,
} as const;

export const customerTestTool: AgentTool = {
  name: CUSTOMER_TEST_NAME,
  description:
    "Eco de prueba 13B. Devuelve { customer: \"test\", message }.",
  inputSchema: MESSAGE_INPUT_SCHEMA,
  /**
   * Legado a propósito `confirm`. El Hub ignora este campo:
   * la Tool Policy es la autoridad de executionMode.
   */
  executionMode: "confirm",
  async execute(input): Promise<ToolResult> {
    if (typeof input !== "object" || input === null) {
      return {
        ok: false,
        error: {
          code: "invalid_input",
          message: "Se espera { message: string }.",
        },
      };
    }
    const message = (input as { message?: unknown }).message;
    if (typeof message !== "string") {
      return {
        ok: false,
        error: {
          code: "invalid_input",
          message: "message debe ser string.",
        },
      };
    }
    return {
      ok: true,
      content: { customer: "test", message },
    };
  },
};
