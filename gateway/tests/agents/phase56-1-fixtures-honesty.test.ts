/**
 * PHASE 56.1-C — Fixtures / policy / enabledTools honesty.
 * No registra fake artifact tools. No concede permisos.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBookWriterDefinition,
  createCodingAgentDefinition,
  createScientificWriterDefinition,
} from "../../src/agents/fixtures.ts";
import {
  createAgentRuntime,
  toolNameAllowed,
} from "../../src/agents/runtime.ts";
import { createBuiltinSkillRegistry } from "../../src/agents/skills/index.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import type { TurnMemory } from "../../src/memory/types.ts";
import type { LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import type { AgentTool } from "../../src/tools/types.ts";

function fakeMemory(): TurnMemory {
  return {
    ensureConversation: (id) => id ?? "c1",
    addMessage: () => "m1",
    getHistory: () => [],
  };
}

function fakeLlm(capture: { tools?: string[] }): LLMProvider {
  return {
    async *stream(req: LLMRequest) {
      capture.tools = req.tools?.map((t) => t.name) ?? [];
      yield { type: "text_delta" as const, text: "ok" };
    },
  };
}

function registryTools(names: string[]): {
  get(name: string): AgentTool | undefined;
  list(): AgentTool[];
} {
  const list = names.map(
    (name): AgentTool => ({
      name,
      description: name,
      inputSchema: { type: "object" },
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

/** Tools that exist today (policy ∩ typical discovery). */
const EXISTING = Object.keys(DEFAULT_TOOL_POLICY);

function intersectionEnabled(
  enabledTools: readonly string[] | undefined,
  registered: readonly string[],
): string[] {
  if (!enabledTools || enabledTools.length === 0) return [...registered];
  return registered.filter((n) => toolNameAllowed(n, enabledTools));
}

function policyAllows(name: string): boolean {
  return DEFAULT_TOOL_POLICY[name] !== undefined;
}

describe("PHASE 56.1-C fixtures honesty", () => {
  it("enabledTools no crea tools fantasma (document/pdf/git)", () => {
    const book = createBookWriterDefinition();
    const sci = createScientificWriterDefinition();
    const code = createCodingAgentDefinition();

    for (const phantom of ["document.create", "pdf.export", "git.status", "image.generate"]) {
      assert.equal(EXISTING.includes(phantom), false);
      assert.equal(policyAllows(phantom), false);
    }

    // Fixtures may list aspirational families; intersection with real registry is filesystem-only (etc).
    const bookLive = intersectionEnabled(book.enabledTools, EXISTING);
    assert.ok(bookLive.every((n) => n.startsWith("filesystem.")));
    assert.equal(bookLive.some((n) => n.startsWith("document.")), false);
    assert.equal(bookLive.some((n) => n.startsWith("pdf.")), false);

    const sciLive = intersectionEnabled(sci.enabledTools, EXISTING);
    assert.equal(sciLive.some((n) => n.startsWith("citation.")), false);
    assert.equal(sciLive.some((n) => n.startsWith("web.")), false);
    assert.ok(sciLive.every((n) => n.startsWith("filesystem.") || n.startsWith("chart.") === false));

    const codeLive = intersectionEnabled(code.enabledTools, EXISTING);
    assert.ok(codeLive.some((n) => n.startsWith("filesystem.")));
    assert.ok(codeLive.some((n) => n.startsWith("process.")));
    assert.equal(codeLive.some((n) => n.startsWith("git.")), false);
  });

  it("skill no crea tool; enabledTools no concede permiso de policy", async () => {
    const capture: { tools?: string[] } = {};
    const coding = createCodingAgentDefinition();
    // Registry has math + filesystem + process; coding enabledTools excludes math.
    const tools = registryTools([
      "filesystem.read",
      "process.execute",
      "math.add",
      "system.info",
    ]);
    const runtime = createAgentRuntime({
      agent: coding,
      memory: fakeMemory(),
      llm: fakeLlm(capture),
      tools,
      skills: createBuiltinSkillRegistry(),
    });
    const gen = runtime.runTurn({ userMessage: "hola" });
    for await (const _ of gen) {
      /* drain */
    }
    assert.ok(capture.tools);
    assert.ok(capture.tools!.includes("filesystem.read"));
    assert.ok(capture.tools!.includes("process.execute"));
    assert.equal(capture.tools!.includes("math.add"), false);
    assert.equal(capture.tools!.includes("system.info"), false);
    assert.equal(capture.tools!.includes("git.status"), false);
  });

  it("herramienta no registrada / no autorizada no aparece; inexistente no rompe Runtime", async () => {
    const book = createBookWriterDefinition();
    const capture: { tools?: string[] } = {};
    // Only filesystem.read exists in registry — document.* never appears.
    const tools = registryTools(["filesystem.read", "filesystem.list"]);
    const runtime = createAgentRuntime({
      agent: book,
      memory: fakeMemory(),
      llm: fakeLlm(capture),
      tools,
      skills: createBuiltinSkillRegistry(),
    });
    const events = [];
    for await (const ev of runtime.runTurn({ userMessage: "escribe" })) {
      events.push(ev);
    }
    assert.ok(capture.tools);
    assert.deepEqual(
      capture.tools!.sort(),
      ["filesystem.list", "filesystem.read"].sort(),
    );
    assert.ok(events.some((e) => e.type === "done" || e.type === "text_delta"));
  });

  it("policy deny-by-default: ausencia en policy = no allow", () => {
    assert.equal(policyAllows("document.create"), false);
    assert.equal(policyAllows("pdf.export"), false);
    assert.equal(policyAllows("filesystem.read"), true);
  });
});
