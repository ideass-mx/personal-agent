import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentDefinition } from "../../src/agents/definition.ts";
import {
  createBookWriterDefinition,
  createCodingAgentDefinition,
  createScientificWriterDefinition,
} from "../../src/agents/fixtures.ts";
import { createDefaultAgentManager } from "../../src/agents/manager.ts";
import { createAgentRuntime, toolNameAllowed } from "../../src/agents/runtime.ts";
import {
  createBuiltinSkillRegistry,
  createEmptySkillRegistry,
  createSkillDefinition,
  resolveAgentInstructions,
  SkillResolutionError,
  SkillRegistry,
} from "../../src/agents/skills/index.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import { toProviderSafeToolName } from "../../src/tools/provider-safe-name.ts";
import type { TurnMemory } from "../../src/memory/types.ts";
import type { LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import type { AgentTool } from "../../src/tools/types.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function fakeMemory(): TurnMemory {
  const msgs = new Map<
    string,
    Array<{ role: "user" | "assistant"; content: string }>
  >();
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

function fakeLlm(capture: {
  system?: string;
  model?: string;
  tools?: string[];
}): LLMProvider {
  return {
    async *stream(req: LLMRequest) {
      capture.system = req.system;
      capture.model = req.model;
      capture.tools = req.tools?.map((t) => t.name);
      yield { type: "text_delta" as const, text: "ok" };
    },
  };
}

function fakeTools(names: string[]) {
  const list = names.map(
    (name): AgentTool => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
      executionMode: name.includes("write") || name.includes("execute")
        ? "confirm"
        : "automatic",
      async execute() {
        return { ok: true, content: {} };
      },
    }),
  );
  return {
    get(name: string) {
      return list.find((t) => t.name === name);
    },
    list() {
      return list;
    },
  };
}

describe("PHASE 56 skills & capabilities", () => {
  it("SkillRegistry register/get/has/list/unregister", () => {
    const reg = createEmptySkillRegistry();
    reg.register(
      createSkillDefinition({
        id: "s1",
        name: "S1",
        instructions: "how to write",
      }),
    );
    assert.equal(reg.has("s1"), true);
    assert.equal(reg.get("s1")?.name, "S1");
    assert.equal(reg.list().length, 1);
    assert.equal(reg.unregister("s1"), true);
    assert.equal(reg.has("s1"), false);
  });

  it("Skill resolution: AgentDefinition → instructions deterministas", () => {
    const skills = createBuiltinSkillRegistry();
    const agent = createBookWriterDefinition();
    const a = resolveAgentInstructions(agent, skills);
    const b = resolveAgentInstructions(agent, skills);
    assert.equal(a, b);
    assert.match(a, /book-writing/);
    assert.match(a, /narrative-structure/);
    assert.ok(a.indexOf("book-writing") < a.indexOf("narrative-structure"));
    assert.doesNotMatch(a, /software-engineering/);
  });

  it("Missing skill → SkillResolutionError (no silencio)", () => {
    const skills = createEmptySkillRegistry();
    const agent = createAgentDefinition({
      id: "x",
      name: "X",
      prompt: "p",
      model: "m",
      toolPolicy: DEFAULT_TOOL_POLICY,
      skills: ["missing-skill"],
    });
    assert.throws(
      () => resolveAgentInstructions(agent, skills),
      (err: unknown) =>
        err instanceof SkillResolutionError &&
        /missing-skill/.test((err as Error).message),
    );
  });

  it("Skill isolation: Book ≠ Coding skills en system prompt", async () => {
    const skills = createBuiltinSkillRegistry();
    const bookCap: { system?: string; tools?: string[] } = {};
    const codeCap: { system?: string; tools?: string[] } = {};
    const tools = fakeTools([
      "filesystem.read",
      "filesystem.write",
      "process.execute",
      "system.info",
    ]);
    const bookRt = createAgentRuntime({
      agent: createBookWriterDefinition(),
      memory: fakeMemory(),
      llm: fakeLlm(bookCap),
      tools,
      skills,
    });
    const codeRt = createAgentRuntime({
      agent: createCodingAgentDefinition(),
      memory: fakeMemory(),
      llm: fakeLlm(codeCap),
      tools,
      skills,
    });
    for await (const _ of bookRt.runTurn({ userMessage: "a" })) {
      /* drain */
    }
    for await (const _ of codeRt.runTurn({ userMessage: "b" })) {
      /* drain */
    }
    assert.match(bookCap.system ?? "", /book-writing/);
    assert.doesNotMatch(bookCap.system ?? "", /software-engineering/);
    assert.match(codeCap.system ?? "", /software-engineering/);
    assert.doesNotMatch(codeCap.system ?? "", /book-writing/);
  });

  it("Tool isolation + prefix enabledTools; Skills no agregan tools", async () => {
    assert.equal(toolNameAllowed("filesystem.read", ["filesystem"]), true);
    assert.equal(toolNameAllowed("process.execute", ["filesystem"]), false);
    const skills = createBuiltinSkillRegistry();
    const cap: { tools?: string[] } = {};
    const rt = createAgentRuntime({
      agent: createCodingAgentDefinition(),
      memory: fakeMemory(),
      llm: fakeLlm(cap),
      tools: fakeTools([
        "filesystem.read",
        "process.execute",
        "system.info",
        "math.add",
      ]),
      skills,
    });
    for await (const _ of rt.runTurn({ userMessage: "x" })) {
      /* drain */
    }
    assert.deepEqual(cap.tools?.slice().sort(), [
      toProviderSafeToolName("filesystem.read"),
      toProviderSafeToolName("process.execute"),
    ]);
  });

  it("Runtime reuse: tres Agents, un AgentRuntime factory (sin BookRuntime)", async () => {
    const manager = createDefaultAgentManager();
    const skills = manager.getSkillRegistry();
    const defs = [
      createBookWriterDefinition(),
      createScientificWriterDefinition(),
      createCodingAgentDefinition(),
    ];
    for (const def of defs) {
      manager.getRegistry().register(def);
    }
    const tools = fakeTools(["filesystem.read", "process.execute"]);
    for (const def of defs) {
      const cap: { system?: string } = {};
      const rt = manager.createRuntime({
        agent: def,
        memory: fakeMemory(),
        llm: fakeLlm(cap),
        tools,
        skills,
      });
      for await (const _ of rt.runTurn({ userMessage: "hi" })) {
        /* drain */
      }
      assert.ok((cap.system ?? "").includes(def.prompt.slice(0, 20)));
    }
    const runtimeSrc = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      runtimeSrc,
      /BookRuntime|ScientificRuntime|CodingRuntime/,
    );
  });

  it("Skill ≠ Tool: instructions orientan; tools ejecutan", () => {
    const skill = createSkillDefinition({
      id: "how-to-write-paper",
      name: "How to write a paper",
      instructions: "cómo escribir un artículo científico",
    });
    assert.doesNotMatch(skill.instructions, /execute|spawn|MCP/);
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts")),
      true,
    );
    assert.equal(existsSync(path.join(repoRoot, "gateway/src/mcp")), false);
  });

  it("phase56 doc + capability matrix honesty", () => {
    const doc = readFileSync(
      path.join(
        repoRoot,
        "docs/architecture/phase56-skills-capabilities.md",
      ),
      "utf8",
    );
    assert.match(doc, /Skill\s+=\s+reusable behavioral knowledge/);
    assert.match(doc, /Tool\s+=\s+executable capability/);
    assert.match(doc, /NOT IMPLEMENTED/);
    assert.match(doc, /office\.excel/);
    assert.match(doc, /filesystem/);
  });
});
