/**
 * Etapa 8C — auditoría fail-closed: confirmación antes de MCP/spawn/write.
 * No añade capacidades; cubre propiedades de frontera.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createFilesystemWriteTool } from "../../../node/src/tools/filesystem-write.ts";
import { FILESYSTEM_WRITE } from "../../../node/src/tools/filesystem-write.ts";
import {
  PROCESS_EXECUTE,
  createProcessExecuteTool,
} from "../../../node/src/tools/process-execute.ts";
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
import { ToolRegistry } from "../../src/tools/registry.ts";
import { createRemoteAgentTool } from "../../src/tools/remote.ts";
import type { RemoteToolExecutor } from "../../src/tools/remote.ts";
import type { AgentTool } from "../../src/tools/types.ts";
import { ClientMessage } from "../../../packages/protocol/messages.ts";

const node = process.execPath;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      if (conversationId && conversations.has(conversationId)) {
        return conversationId;
      }
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content });
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

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  onConfirm: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm(event);
  }
  return out;
}

function countingRemote(
  inner: AgentTool,
): { tool: AgentTool; mcp: { n: number }; exec: { n: number } } {
  const mcp = { n: 0 };
  const exec = { n: 0 };
  const executor: RemoteToolExecutor = {
    async execute(request) {
      mcp.n += 1;
      exec.n += 1;
      const result = await inner.execute(request.input, request.context);
      return { requestId: request.requestId, result };
    },
  };
  const tool = createRemoteAgentTool(
    {
      name: inner.name,
      description: inner.description,
      inputSchema: inner.inputSchema,
      executionMode: inner.executionMode,
    },
    executor,
  );
  return { tool, mcp, exec };
}

async function runConfirmTurn(opts: {
  tool: AgentTool;
  input: unknown;
  onConfirm: (
    req: Extract<AgentEvent, { type: "confirm_request" }>,
    waiter: ReturnType<typeof createConfirmationWaiter>,
  ) => void;
  timeoutMs?: number;
}): Promise<AgentEvent[]> {
  const tools = new ToolRegistry();
  tools.register(opts.tool);
  const waiter = createConfirmationWaiter({
    sessionId: "ws_8c",
    deviceId: "d1",
    timeoutMs: opts.timeoutMs ?? 5_000,
  });
  return runTurnCollecting(
    createAgentRuntime({
      memory: createFakeMemory(),
      llm: createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_8c",
            name: opts.tool.name,
            input: opts.input,
          },
          { type: "done" },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]),
      tools,
    }).runTurn({
      conversationId: "c_8c",
      sessionId: waiter.sessionId,
      deviceId: "d1",
      userMessage: "go",
      confirmation: waiter.port,
    }),
    (req) => opts.onConfirm(req, waiter),
  );
}

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("8C confirmación: process.execute y filesystem.write", () => {
  const procInput = {
    command: node,
    args: ["-e", "process.stdout.write('ran')"],
  };

  it("process.execute reject/timeout/cancel: 0 MCP, 0 spawn", async () => {
    for (const mode of ["reject", "timeout", "cancel"] as const) {
      const inner = createProcessExecuteTool();
      const { tool, mcp, exec } = countingRemote(inner);
      await runConfirmTurn({
        tool,
        input: procInput,
        timeoutMs: mode === "timeout" ? 25 : 5_000,
        onConfirm: (req, waiter) => {
          if (mode === "reject") waiter.respond(req.confirmationId, false);
          if (mode === "cancel") waiter.cancelAll();
        },
      });
      assert.equal(mcp.n, 0, mode);
      assert.equal(exec.n, 0, mode);
    }
  });

  it("process.execute approve: 1 MCP y 1 spawn", async () => {
    const inner = createProcessExecuteTool();
    const { tool, mcp, exec } = countingRemote(inner);
    await runConfirmTurn({
      tool,
      input: procInput,
      onConfirm: (req, waiter) => {
        waiter.respond(req.confirmationId, true);
      },
    });
    assert.equal(mcp.n, 1);
    assert.equal(exec.n, 1);
  });

  it("process.execute approve+reject concurrentes: ≤1 ejecución", async () => {
    const inner = createProcessExecuteTool();
    const { tool, exec } = countingRemote(inner);
    await runConfirmTurn({
      tool,
      input: procInput,
      onConfirm: (req, waiter) => {
        waiter.respond(req.confirmationId, true);
        waiter.respond(req.confirmationId, false);
      },
    });
    assert.ok(exec.n <= 1);
  });

  it("process.execute id ajeno / ya resuelto: no hay segunda ejecución", async () => {
    const inner = createProcessExecuteTool();
    const { tool, exec } = countingRemote(inner);
    await runConfirmTurn({
      tool,
      input: procInput,
      onConfirm: (req, waiter) => {
        assert.equal(waiter.respond("cf_otro", true), false);
        assert.equal(waiter.respond(req.confirmationId, true), true);
        assert.equal(waiter.respond(req.confirmationId, true), false);
      },
    });
    assert.equal(exec.n, 1);
  });

  it("filesystem.write reject/timeout/cancel: 0 MCP, 0 write", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-8c-w-"));
    const target = path.join(dir, "out.txt");
    for (const mode of ["reject", "timeout", "cancel"] as const) {
      const inner = createFilesystemWriteTool();
      const { tool, mcp, exec } = countingRemote(inner);
      await runConfirmTurn({
        tool,
        input: { path: target, content: "x" },
        timeoutMs: mode === "timeout" ? 25 : 5_000,
        onConfirm: (req, waiter) => {
          if (mode === "reject") waiter.respond(req.confirmationId, false);
          if (mode === "cancel") waiter.cancelAll();
        },
      });
      assert.equal(mcp.n, 0, mode);
      assert.equal(exec.n, 0, mode);
      assert.equal(existsSync(target), false, mode);
    }
  });

  it("filesystem.write approve: 1 MCP, 1 write", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-8c-wa-"));
    const target = path.join(dir, "out.txt");
    const inner = createFilesystemWriteTool();
    const { tool, mcp, exec } = countingRemote(inner);
    await runConfirmTurn({
      tool,
      input: { path: target, content: "hola" },
      onConfirm: (req, waiter) => {
        waiter.respond(req.confirmationId, true);
      },
    });
    assert.equal(mcp.n, 1);
    assert.equal(exec.n, 1);
    assert.equal(await readFile(target, "utf8"), "hola");
  });

  it("confirm_response ignora command/path inyectados", () => {
    const msg = ClientMessage.parse({
      type: "confirm_response",
      confirmationId: "cf_x",
      approved: true,
      command: "bash",
      args: ["-c", "rm -rf /"],
      path: "/etc/passwd",
      toolName: PROCESS_EXECUTE.name,
    });
    assert.equal(msg.type, "confirm_response");
    if (msg.type === "confirm_response") {
      assert.equal("command" in msg, false);
      assert.equal("path" in msg, false);
      assert.equal("toolName" in msg, false);
    }
  });
});

describe("8C arquitectura Hub ↔ Agent", () => {
  it("AgentRuntime no nombra tools peligrosas", () => {
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /process\.execute/);
    assert.doesNotMatch(src, /filesystem\.(read|write|list)/);
    assert.match(src, /executionMode/);
  });

  it("Hub productivo no registra process/filesystem ni spawnea", () => {
    const index = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(index, /process\.execute|filesystem\./);
    /** PHASE 59: único allowlist — OS Credential Manager (no tool spawn). */
    const childProcessAllow = new Set([
      path.join(
        repoRoot,
        "gateway/src/credentials/stores/windows-credential-store.ts",
      ),
    ]);
    for (const file of walkTs(path.join(repoRoot, "gateway/src"))) {
      const text = readFileSync(file, "utf8");
      if (!childProcessAllow.has(file)) {
        assert.doesNotMatch(text, /from ["']node:child_process/, file);
      }
      assert.doesNotMatch(text, /from ["']guardian/, file);
    }
  });

  it("MCP executor no reintenta", () => {
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/tools/mcp/executor.ts"),
      "utf8",
    );
    assert.match(src, /sin retry/);
    assert.doesNotMatch(src, /for\s*\(.*retry/);
    assert.doesNotMatch(src, /while\s*\(.*retry/);
  });

  it("PHASE 59: read/list usan resolveReadablePath; write usa resolveSafePath", () => {
    for (const name of ["filesystem-read.ts", "filesystem-list.ts"]) {
      const src = readFileSync(
        path.join(repoRoot, "node/src/tools", name),
        "utf8",
      );
      assert.match(src, /resolveReadablePath/, name);
      assert.doesNotMatch(src, /resolveSafePath/, name);
    }
    const writeSrc = readFileSync(
      path.join(repoRoot, "node/src/tools/filesystem-write.ts"),
      "utf8",
    );
    assert.match(writeSrc, /resolveSafePath/);
  });

  it("process.execute spawn: shell false y stdio no hereda MCP stdout", () => {
    const src = readFileSync(
      path.join(repoRoot, "node/src/tools/process-execute.ts"),
      "utf8",
    );
    assert.match(src, /shell:\s*false/);
    assert.match(src, /stdio:\s*\[\s*["']ignore["']\s*,\s*["']pipe["']\s*,\s*["']pipe["']/);
    assert.doesNotMatch(src, /\bexec\(/);
    assert.doesNotMatch(src, /execSync|spawnSync|execFile/);
    assert.doesNotMatch(src, /shell:\s*true/);
  });

  it("no hay tercer proceso en el pipeline Hub/Agent", () => {
    for (const file of [
      ...walkTs(path.join(repoRoot, "gateway/src")),
      ...walkTs(path.join(repoRoot, "node/src")),
    ]) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /from ["'].*guardian/, file);
    }
    assert.equal(FILESYSTEM_WRITE.executionMode, "confirm");
    assert.equal(PROCESS_EXECUTE.executionMode, "confirm");
  });
});
