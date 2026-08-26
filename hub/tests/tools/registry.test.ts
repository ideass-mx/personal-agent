import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { toLLMToolDescriptor } from "../../src/tools/descriptor.ts";
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

function createEchoTool(
  executionMode: AgentTool["executionMode"] = "automatic",
): AgentTool {
  return {
    name: "echo",
    description: "Devuelve el texto recibido sin cambios.",
    inputSchema: { ...echoInputSchema },
    executionMode,
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

describe("ToolExecutionMode", () => {
  it("echo declara executionMode automatic", () => {
    assert.equal(createEchoTool("automatic").executionMode, "automatic");
  });

  it("una tool puede declarar executionMode confirm", () => {
    const confirmTool = createEchoTool("confirm");
    assert.equal(confirmTool.executionMode, "confirm");
  });

  it("ToolRegistry conserva executionMode", () => {
    const registry = new ToolRegistry();
    const confirmTool = createEchoTool("confirm");
    // echo ya usa name "echo"; registrar confirm con nombre distinto
    const risky: AgentTool = {
      ...confirmTool,
      name: "risky_write",
      executionMode: "confirm",
    };
    registry.register(createEchoTool());
    registry.register(risky);

    assert.equal(registry.get("echo")?.executionMode, "automatic");
    assert.equal(registry.get("risky_write")?.executionMode, "confirm");
  });

  it("el descriptor para el LLM no incluye executionMode", () => {
    const descriptor = toLLMToolDescriptor(createEchoTool());
    assert.equal("executionMode" in descriptor, false);
    assert.deepEqual(Object.keys(descriptor).sort(), [
      "description",
      "inputSchema",
      "name",
    ]);

    const confirmDescriptor = toLLMToolDescriptor({
      ...createEchoTool("confirm"),
      name: "needs_confirm",
    });
    assert.equal("executionMode" in confirmDescriptor, false);
  });

  it("AgentRuntime consulta executionMode pero no nombres concretos de tools", () => {
    const runtimePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/agent/runtime.ts",
    );
    const src = readFileSync(runtimePath, "utf8");
    assert.match(src, /executionMode/);
    assert.doesNotMatch(src, /filesystem\.write/);
    assert.doesNotMatch(src, /gmail\.send/);
    assert.doesNotMatch(src, /test\.confirm/);
    assert.doesNotMatch(src, /calculator/);
  });
});
