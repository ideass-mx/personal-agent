/**
 * 9A: Hub posee el lifecycle del Agent (spawn MCP stdio).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import { createConfirmationWaiter } from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { attachLocalAgent } from "../../src/runtime/attach-agent.ts";
import {
  AGENT_DISCONNECTED,
  AGENT_SPAWN_ERROR,
  HubAgentError,
} from "../../src/runtime/errors.ts";
import {
  assertListedAgentTools,
} from "../../src/tools/discover.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const hubRoot = path.join(repoRoot, "gateway");
const tsxCli = path.join(hubRoot, "node_modules/tsx/dist/cli.mjs");

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ conversationId, role, content });
      return id;
    },
    getHistory(conversationId): HistoryEntry[] {
      return messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
    },
  };
}

function createScriptedLLM(
  steps: Array<(request: LLMRequest) => LLMEvent[]>,
): LLMProvider {
  let index = 0;
  return {
    async *stream(request) {
      const step = steps[index];
      if (!step) throw new Error(`FakeLLM: no hay paso ${index}`);
      index += 1;
      for (const event of step(request)) yield event;
    },
  };
}

async function collect(
  events: AsyncIterable<AgentEvent>,
  onConfirm?: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm?.(event);
  }
  return out;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(pred: () => boolean, ms = 8_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("timeout waitUntil");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("9A lifecycle Hub → Agent", () => {
  it("A–D: spawn, initialize, tools/list, READY solo con Agent", async () => {
    const tools = new ToolRegistry();
    let hubReady = false;
    const agent = await attachLocalAgent({ registry: tools });
    try {
      hubReady = agent.ready;
      assert.equal(agent.ready, true);
      assert.ok(agent.pid && pidAlive(agent.pid));
      assert.ok(tools.get("filesystem.read"));
      assert.ok(tools.get("filesystem.list"));
      assert.ok(tools.get("filesystem.write"));
      assert.ok(tools.get("process.execute"));
      assert.equal(tools.get("filesystem.read")?.executionMode, "automatic");
      assert.equal(tools.get("filesystem.write")?.executionMode, "confirm");
    } finally {
      await agent.shutdown();
    }
    assert.equal(hubReady, true);
    const index = readFileSync(path.join(hubRoot, "src/index.ts"), "utf8");
    const attachAt = index.indexOf("attachLocalNode");
    const readyAt = index.indexOf("[gateway] READY");
    assert.ok(attachAt >= 0 && readyAt > attachAt);
  });

  it("E: Agent muerto durante startup", async () => {
    await assert.rejects(
      () =>
        attachLocalAgent({
          registry: new ToolRegistry(),
          stdio: {
            command: process.execPath,
            args: ["-e", "process.exit(1)"],
            cwd: repoRoot,
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof HubAgentError);
        assert.ok(
          err.code === AGENT_SPAWN_ERROR ||
            err.code === "agent_startup_error" ||
            err.code === "mcp_initialize_error",
        );
        return true;
      },
    );
  });

  it("F/P: Agent muerto después de startup → fail sin retry", async () => {
    const tools = new ToolRegistry();
    const agent = await attachLocalAgent({ registry: tools });
    try {
      const pid = agent.pid;
      assert.ok(pid);
      process.kill(pid, "SIGKILL");
      await waitUntil(() => !pidAlive(pid));
      const tool = tools.get("filesystem.read");
      assert.ok(tool);
      const a = await tool.execute({ path: "x" }, { conversationId: "c" });
      const b = await tool.execute({ path: "x" }, { conversationId: "c" });
      assert.equal(a.ok, false);
      assert.equal(b.ok, false);
      if (!a.ok) {
        assert.ok(
          a.error.code === AGENT_DISCONNECTED ||
            a.error.code === "remote_tool_error",
        );
      }
    } finally {
      await agent.shutdown();
    }
  });

  it("G/H: shutdown mata Agent y es idempotente", async () => {
    const agent = await attachLocalAgent({ registry: new ToolRegistry() });
    const pid = agent.pid;
    assert.ok(pid);
    await agent.shutdown();
    await agent.shutdown();
    await waitUntil(() => !pidAlive(pid));
  });

  it("I/J: SIGINT y SIGTERM detienen el Agent", async () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const child = spawn(
        process.execPath,
        [tsxCli, path.join(hubRoot, "tests/runtime/hold-agent.ts")],
        { cwd: hubRoot, stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      await waitUntil(() => stderr.includes("HOLD_READY"), 20_000);
      const m = stderr.match(/HOLD_PID=(\d+)/);
      assert.ok(m);
      const agentPid = Number(m[1]);
      child.kill(signal);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${signal} timeout`)), 15_000);
        child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
      await waitUntil(() => !pidAlive(agentPid), 8_000);
    }
  });

  it("K/L: stdout del Agent no trae banners; stderr sí logs", async () => {
    const agentPkg = path.join(repoRoot, "node");
    const child = spawn(
      process.execPath,
      [
        path.join(agentPkg, "node_modules/tsx/dist/cli.mjs"),
        path.join(agentPkg, "src/index.ts"),
      ],
      { cwd: agentPkg, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    try {
      await waitUntil(() => stderr.includes("[node] MCP stdio listo"), 15_000);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(stdout.includes("[node]"), false);
      assert.equal(stdout.includes("listo"), false);
      assert.match(stderr, /\[node\] MCP stdio listo/);
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => child.once("exit", r));
    }
  });

  it("M: tool desconocida falla (tool_not_found)", async () => {
    const tools = new ToolRegistry();
    const agent = await attachLocalAgent({ registry: tools });
    const dumped: string[] = [];
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "x",
            name: "no.existe",
            input: {},
          },
        ],
        (req) => {
          dumped.push(JSON.stringify(req.messages.at(-1)));
          return [{ type: "text_delta", text: "no" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      await collect(
        runtime.runTurn({
          conversationId: "c_u",
          userMessage: "x",
        }),
      );
      assert.match(dumped.join(""), /tool_not_found|no\.existe/);
    } finally {
      await agent.shutdown();
    }
  });

  it("N: reject confirmation → 0 MCP", async () => {
    const tools = new ToolRegistry();
    const agent = await attachLocalAgent({ registry: tools });
    const waiter = createConfirmationWaiter({
      sessionId: "ws_n",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    const orig = tools.get("filesystem.write")!;
    let mcp = 0;
    try {
      const inner = orig.execute.bind(orig);
      orig.execute = async (input, ctx) => {
        mcp += 1;
        return inner(input, ctx);
      };
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "w",
            name: "filesystem.write",
            input: { path: "n.txt", content: "n" },
          },
        ],
        () => [{ type: "text_delta", text: "no" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      await collect(
        runtime.runTurn({
          conversationId: "c_n",
          deviceId: "d1",
          sessionId: "ws_n",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => waiter.respond(req.confirmationId, false),
      );
      assert.equal(mcp, 0);
    } finally {
      await agent.shutdown();
    }
  });

  it("O/R: approve write → 1 MCP, 1 write, done", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-9a-w-"));
    const tools = new ToolRegistry();
    const agent = await attachLocalAgent({
      registry: tools,
      filesystemRoot: root,
    });
    const waiter = createConfirmationWaiter({
      sessionId: "ws_o",
      deviceId: "d1",
      timeoutMs: 8_000,
    });
    const orig = tools.get("filesystem.write")!;
    let mcp = 0;
    const inner = orig.execute.bind(orig);
    orig.execute = async (input, ctx) => {
      mcp += 1;
      return inner(input, ctx);
    };
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "w",
            name: "filesystem.write",
            input: { path: "out.txt", content: "9a" },
          },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      const events = await collect(
        runtime.runTurn({
          conversationId: "c_o",
          deviceId: "d1",
          sessionId: "ws_o",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => waiter.respond(req.confirmationId, true),
      );
      assert.equal(mcp, 1);
      const written = readFileSync(path.join(root, "out.txt"), "utf8");
      assert.equal(written, "9a");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await agent.shutdown();
    }
  });

  it("Q: FakeLLM → filesystem.read → done", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-9a-r-"));
    await writeFile(path.join(root, "nota.txt"), "hola 9a", "utf8");
    const tools = new ToolRegistry();
    const agent = await attachLocalAgent({
      registry: tools,
      filesystemRoot: root,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "r",
            name: "filesystem.read",
            input: { path: "nota.txt" },
          },
        ],
        () => [{ type: "text_delta", text: "leído" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      const events = await collect(
        runtime.runTurn({
          conversationId: "c_q",
          userMessage: "lee",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await agent.shutdown();
    }
  });

  it("discovery fail-closed: duplicados e inválidos", () => {
    assert.throws(() =>
      assertListedAgentTools([
        { name: "filesystem.read", inputSchema: {} },
        { name: "filesystem.read", inputSchema: {} },
      ]),
    );
    assert.throws(() =>
      assertListedAgentTools([{ name: "", inputSchema: {} }]),
    );
    assert.throws(() =>
      assertListedAgentTools([{ name: "filesystem.read", inputSchema: "no" }]),
    );
  });

  it("ausencia: no hay PermissionManager/PolicyEngine/Sandbox/tercer proceso", () => {
    const src = [
      path.join(hubRoot, "src/runtime/attach-agent.ts"),
      path.join(hubRoot, "src/index.ts"),
    ];
    for (const file of src) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /PermissionManager|PolicyEngine|SandboxManager|Guardian/);
    }
    assert.equal(existsSync(path.join(repoRoot, "node/src/guardian")), false);
  });
});
