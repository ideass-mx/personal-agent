import type { AgentTool, ToolResult } from "./types.ts";

type Operation = "add" | "subtract" | "multiply" | "divide";

function parseInput(
  input: unknown,
):
  | { ok: true; a: number; b: number; operation: Operation }
  | { ok: false; result: ToolResult } {
  if (typeof input !== "object" || input === null) {
    return {
      ok: false,
      result: {
        ok: false,
        error: {
          code: "invalid_input",
          message: "Se espera un objeto { a, b, operation }.",
        },
      },
    };
  }

  const { a, b, operation } = input as Record<string, unknown>;
  const ops: Operation[] = ["add", "subtract", "multiply", "divide"];

  if (typeof a !== "number" || !Number.isFinite(a)) {
    return {
      ok: false,
      result: {
        ok: false,
        error: { code: "invalid_input", message: "`a` debe ser un número." },
      },
    };
  }
  if (typeof b !== "number" || !Number.isFinite(b)) {
    return {
      ok: false,
      result: {
        ok: false,
        error: { code: "invalid_input", message: "`b` debe ser un número." },
      },
    };
  }
  if (typeof operation !== "string" || !ops.includes(operation as Operation)) {
    return {
      ok: false,
      result: {
        ok: false,
        error: {
          code: "invalid_input",
          message:
            "`operation` debe ser add | subtract | multiply | divide.",
        },
      },
    };
  }

  return { ok: true, a, b, operation: operation as Operation };
}

export const calculatorTool: AgentTool = {
  name: "calculator",
  description:
    "Realiza una operación aritmética básica entre dos números: add, subtract, multiply o divide.",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
      },
    },
    required: ["a", "b", "operation"],
    additionalProperties: false,
  },
  async execute(input): Promise<ToolResult> {
    const parsed = parseInput(input);
    if (!parsed.ok) return parsed.result;

    const { a, b, operation } = parsed;
    let result: number;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) {
          return {
            ok: false,
            error: {
              code: "division_by_zero",
              message: "No se puede dividir entre cero.",
            },
          };
        }
        result = a / b;
        break;
    }

    return { ok: true, content: { result, a, b, operation } };
  },
};
