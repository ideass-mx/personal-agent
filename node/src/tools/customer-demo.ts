/**
 * customer.demo — eco no privilegiado de personalización de cliente.
 * Sin filesystem, spawn, red, variables de entorno ni secretos.
 *
 * Identidad 11A: extensión `customer` → tool `customer.demo`.
 * El archivo se llama customer-demo.ts (demo de bundle por cliente).
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const CUSTOMER_DEMO_NAME = "customer.demo";

const MESSAGE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
  additionalProperties: false,
} as const;

export const customerDemoTool: AgentTool = {
  name: CUSTOMER_DEMO_NAME,
  description:
    "Eco de demostración de cliente. Devuelve { customer: \"demo\", message }.",
  inputSchema: MESSAGE_INPUT_SCHEMA,
  /**
   * Campo legado. El Hub lo ignora: executionMode lo decide
   * la Tool Policy del Hub (customer.demo → automatic).
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
      content: { customer: "demo", message },
    };
  },
};
