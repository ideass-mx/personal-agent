import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentDefinition,
  createDefaultAgentDefinition,
  DEFAULT_AGENT_DEFINITION_ID,
} from "../../src/agents/definition.ts";
import { DEFAULT_TOOL_POLICY as POLICY } from "../../src/tools/policy.ts";
import {
  AgentRegistry,
  createDefaultAgentRegistry,
} from "../../src/agents/registry.ts";
import {
  createDefaultAgentManager,
} from "../../src/agents/manager.ts";
import { createAgentRuntime } from "../../src/agents/runtime.ts";
import type { TurnMemory } from "../../src/memory/types.ts";
import type { LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import type { AgentTool } from "../../src/tools/types.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function fakeMemory(): TurnMemory {
  const msgs = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();
  return {
    ensureConversation(id) {
      const cid = id ?? "c1";
      if (!msgs.has(cid)) msgs.set(cid, []);
      return cid;
    },
    addMessage(cid, role, content) {
      msgs.get(cid)!.push({ role, content });
      return `m_${msgs.get(cid)!.length}`;
    },
    getHistory(cid) {
      return [...(msgs.get(cid) ?? [])];
    },
  };
}

function fakeLlm(capture: { system?: string; model?: string; tools?: string[] }): LLMProvider {
  return {
    async *stream(req: LLMRequest) {
      capture.system = req.system;
      capture.model = req.model;
      capture.tools = req.tools?.map((t) => t.name);
      yield { type: "text_delta" as const, text: "ok" };
    },
  };
}

function fakeTools(names: string[]): {
  get(name: string): AgentTool | undefined;
  list(): AgentTool[];
} {
  const list = names.map(
    (name): AgentTool => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
      executionMode: "automatic",
      async execute() {
        return { ok: true, content: {} };
      },
    }),
  );
  return {
    get(name) {
      return list.find((t) => t.name === name);
    },
    list() {
      return list;
    },
  };
}

describe("PHASE 55 agent model", () => {
  it("AgentDefinition existe sin proceso (id lógico ≠ agentId instalación)", () => {
    const def = createDefaultAgentDefinition();
    assert.equal(def.id, DEFAULT_AGENT_DEFINITION_ID);
    assert.ok(def.name.length > 0);
    assert.ok(def.prompt.length > 0);
    assert.ok(def.model.length > 0);
    assert.equal(def.memoryPolicy?.scope, "conversation");
    assert.doesNotMatch(def.id, /^installation-/);
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/agents/definition.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /child_process|attachLocalNode|mcp\/stdio/);
  });

  it("AgentRegistry registra y recupera definiciones", () => {
    const registry = new AgentRegistry();
    const a = createAgentDefinition({
      id: "research-agent",
      name: "Research",
      prompt: "research",
      model: "claude-sonnet-4-6",
      toolPolicy: POLICY,
    });
    registry.register(a);
    assert.equal(registry.has("research-agent"), true);
    assert.equal(registry.get("research-agent")?.name, "Research");
    assert.equal(registry.list().length, 1);
    assert.equal(registry.unregister("research-agent"), true);
    assert.equal(registry.has("research-agent"), false);
  });

  it("AgentManager resuelve default y createRuntime", async () => {
    const manager = createDefaultAgentManager();
    assert.equal(manager.getDefaultAgent().id, DEFAULT_AGENT_DEFINITION_ID);
    assert.equal(manager.resolveAgent().id, DEFAULT_AGENT_DEFINITION_ID);
    assert.equal(manager.listAgents().length, 1);

    const capture: { system?: string; model?: string } = {};
    const runtime = manager.createRuntime({
      memory: fakeMemory(),
      llm: fakeLlm(capture),
      tools: fakeTools(["system.info"]),
    });
    const events = [];
    for await (const ev of runtime.runTurn({ userMessage: "hola" })) {
      events.push(ev);
    }
    assert.equal(capture.system, manager.getDefaultAgent().prompt);
    assert.equal(capture.model, manager.getDefaultAgent().model);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("Runtime isolation: dos definiciones no se contaminan", async () => {
    const a = createAgentDefinition({
      id: "a",
      name: "A",
      prompt: "PROMPT_A",
      model: "model-a",
      toolPolicy: POLICY,
      enabledTools: ["t1"],
    });
    const b = createAgentDefinition({
      id: "b",
      name: "B",
      prompt: "PROMPT_B",
      model: "model-b",
      toolPolicy: POLICY,
      enabledTools: ["t2"],
    });
    const capA: { system?: string; model?: string; tools?: string[] } = {};
    const capB: { system?: string; model?: string; tools?: string[] } = {};
    const tools = fakeTools(["t1", "t2", "t3"]);
    const rtA = createAgentRuntime({
      agent: a,
      memory: fakeMemory(),
      llm: fakeLlm(capA),
      tools,
    });
    const rtB = createAgentRuntime({
      agent: b,
      memory: fakeMemory(),
      llm: fakeLlm(capB),
      tools,
    });
    for await (const _ of rtA.runTurn({ userMessage: "x" })) {
      /* drain */
    }
    for await (const _ of rtB.runTurn({ userMessage: "y" })) {
      /* drain */
    }
    assert.equal(capA.system, "PROMPT_A");
    assert.equal(capA.model, "model-a");
    assert.deepEqual(capA.tools, ["t1"]);
    assert.equal(capB.system, "PROMPT_B");
    assert.equal(capB.model, "model-b");
    assert.deepEqual(capB.tools, ["t2"]);
  });

  it("ToolRegistry boundary: Runtime no importa MCP; MCP bajo tools/mcp", () => {
    const runtime = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /@modelcontextprotocol|tools\/mcp|stdio/);
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts")),
      true,
    );
    assert.equal(existsSync(path.join(repoRoot, "gateway/src/mcp")), false);
  });

  it("Agent != Node/Gateway/MCP; Node sigue en node/", () => {
    const def = readFileSync(
      path.join(repoRoot, "gateway/src/agents/definition.ts"),
      "utf8",
    );
    assert.match(def, /No es un proceso/);
    assert.equal(existsSync(path.join(repoRoot, "node/src/mcp/server.ts")), true);
    assert.equal(existsSync(path.join(repoRoot, "gateway/src/agents")), true);
    const doc = path.join(
      repoRoot,
      "docs/architecture/phase55-agent-model.md",
    );
    assert.equal(existsSync(doc), true);
    const text = readFileSync(doc, "utf8");
    assert.match(text, /Agent != process/);
    assert.match(text, /agentId/);
    assert.match(text, /AgentDefinition\.id/);
  });

  it("default registry key is personal-assistant", () => {
    const reg = createDefaultAgentRegistry();
    assert.ok(reg.has(DEFAULT_AGENT_DEFINITION_ID));
    assert.equal(reg.list()[0]?.id, DEFAULT_AGENT_DEFINITION_ID);
  });

  it("createAgentDefinition rechaza id vacío", () => {
    assert.throws(() =>
      createAgentDefinition({
        id: "  ",
        name: "X",
        prompt: "p",
        model: "m",
        toolPolicy: POLICY,
      }),
    );
  });
});
