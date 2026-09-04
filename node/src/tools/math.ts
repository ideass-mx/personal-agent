/**
 * math.* — aritmética pura en el Local Node (MCP Server).
 * Sin filesystem, process, Hub ni AgentRuntime.
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const MATH_ADD_NAME = "math.add";
export const MATH_SUBTRACT_NAME = "math.subtract";
export const MATH_MULTIPLY_NAME = "math.multiply";
export const MATH_DIVIDE_NAME = "math.divide";

const NUMBER_PAIR_SCHEMA = {
  type: "object",
  properties: {
    a: { type: "number" },
    b: { type: "number" },
  },
  required: ["a", "b"],
  additionalProperties: false,
} as const;

function fail(message: string): ToolResult {
  return { ok: false, error: { code: "invalid_input", message } };
}

function parseOperands(
  input: unknown,
): { ok: true; a: number; b: number } | { ok: false; result: ToolResult } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, result: fail("Se espera { a: number, b: number }.") };
  }
  const rec = input as { a?: unknown; b?: unknown };
  if (typeof rec.a !== "number" || !Number.isFinite(rec.a)) {
    return { ok: false, result: fail("`a` debe ser un número finito.") };
  }
  if (typeof rec.b !== "number" || !Number.isFinite(rec.b)) {
    return { ok: false, result: fail("`b` debe ser un número finito.") };
  }
  return { ok: true, a: rec.a, b: rec.b };
}

function pairTool(
  name: string,
  description: string,
  compute: (a: number, b: number) => ToolResult,
): AgentTool {
  return {
    name,
    description,
    inputSchema: NUMBER_PAIR_SCHEMA,
    executionMode: "automatic",
    async execute(input): Promise<ToolResult> {
      const parsed = parseOperands(input);
      if (!parsed.ok) return parsed.result;
      return compute(parsed.a, parsed.b);
    },
  };
}

export const mathAddTool: AgentTool = pairTool(
  MATH_ADD_NAME,
  "Suma dos números. Devuelve { result }.",
  (a, b) => ({ ok: true, content: { result: a + b } }),
);

export const mathSubtractTool: AgentTool = pairTool(
  MATH_SUBTRACT_NAME,
  "Resta b de a. Devuelve { result }.",
  (a, b) => ({ ok: true, content: { result: a - b } }),
);

export const mathMultiplyTool: AgentTool = pairTool(
  MATH_MULTIPLY_NAME,
  "Multiplica dos números. Devuelve { result }.",
  (a, b) => ({ ok: true, content: { result: a * b } }),
);

export const mathDivideTool: AgentTool = pairTool(
  MATH_DIVIDE_NAME,
  "Divide a entre b. Devuelve { result }.",
  (a, b) => {
    if (b === 0) {
      return {
        ok: false,
        error: {
          code: "division_by_zero",
          message: "No se puede dividir entre cero.",
        },
      };
    }
    return { ok: true, content: { result: a / b } };
  },
);
