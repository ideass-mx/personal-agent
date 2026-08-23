import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool, ToolContext } from "../../src/tools/types.ts";

const echoInputSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

function createEchoTool(): AgentTool {
  return {
    name: "echo",
    description: "Devuelve el texto recibido sin cambios.",
    inputSchema: { ...echoInputSchema },
    async execute(input, _context: ToolContext) {
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
}

describe("ToolRegistry", () => {
  it("registra y obtiene una tool por nombre", () => {
    const registry = new ToolRegistry();
    const echo = createEchoTool();
    registry.register(echo);

    assert.equal(registry.get("echo"), echo);
    assert.equal(registry.get("missing"), undefined);
  });

  it("lista las tools registradas", () => {
    const registry = new ToolRegistry();
    const echo = createEchoTool();
    registry.register(echo);

    assert.deepEqual(registry.list(), [echo]);
  });

  it("rechaza nombres duplicados", () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    assert.throws(
      () => registry.register(createEchoTool()),
      /Tool ya registrada: echo/,
    );
  });
});

describe("AgentTool execute (echo)", () => {
  it("ejecuta echo y devuelve ToolResult de éxito", async () => {
    const echo = createEchoTool();
    const result = await echo.execute(
      { text: "hola" },
      { conversationId: "c_1", deviceId: "d_1" },
    );

    assert.deepEqual(result, { ok: true, content: { text: "hola" } });
  });

  it("devuelve ToolResult de error ante input inválido", async () => {
    const echo = createEchoTool();
    const result = await echo.execute(
      { nope: true },
      { conversationId: "c_1" },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "invalid_input");
    }
  });
});
