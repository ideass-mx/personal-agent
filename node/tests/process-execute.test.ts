import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import {
  PROCESS_EXECUTE,
  PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS,
  PROCESS_EXECUTE_MAX_OUTPUT_BYTES,
  PROCESS_EXECUTE_MCP_SLACK_MS,
  createProcessExecuteTool,
  mcpTimeoutMsForProcessExecute,
} from "../src/tools/process-execute.ts";

const ctx = { conversationId: "c" };
const srcPath = fileURLToPath(
  new URL("../src/tools/process-execute.ts", import.meta.url),
);
const node = process.execPath;

function contentOf(result: { ok: true; content: unknown }) {
  return result.content as {
    command: string;
    args: string[];
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
  };
}

describe("process.execute", () => {
  it("está en el registry, es confirm y usa spawn shell:false", () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get(PROCESS_EXECUTE.name);
    assert.ok(tool);
    assert.equal(tool.executionMode, "confirm");
    const src = readFileSync(srcPath, "utf8");
    assert.match(src, /shell:\s*false/);
    assert.doesNotMatch(src, /confirm_request/);
    assert.doesNotMatch(src, /\bexec\(/);
  });

  it("ejecuta command+args separados y captura stdout", async () => {
    const tool = createProcessExecuteTool();
    const result = await tool.execute(
      {
        command: node,
        args: ["-e", "process.stdout.write(['hello','world'].join(' '))"],
      },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const c = contentOf(result);
    assert.equal(c.exitCode, 0);
    assert.equal(c.timedOut, false);
    assert.equal(c.stdout, "hello world");
    assert.deepEqual(c.args[0], "-e");
  });

  it("exitCode != 0 sigue siendo ok:true", async () => {
    const tool = createProcessExecuteTool();
    const result = await tool.execute(
      { command: node, args: ["-e", "process.exit(7)"] },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(contentOf(result).exitCode, 7);
  });

  it("captura stderr", async () => {
    const tool = createProcessExecuteTool();
    const result = await tool.execute(
      { command: node, args: ["-e", "process.stderr.write('boom')"] },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(contentOf(result).stderr.includes("boom"), true);
  });

  it("trunca stdout y stderr a 64 KiB", async () => {
    const tool = createProcessExecuteTool();
    const n = PROCESS_EXECUTE_MAX_OUTPUT_BYTES + 2048;
    const out = await tool.execute(
      {
        command: node,
        args: ["-e", `process.stdout.write("x".repeat(${n}))`],
      },
      ctx,
    );
    assert.equal(out.ok, true);
    if (!out.ok) return;
    const c = contentOf(out);
    assert.equal(c.stdoutTruncated, true);
    assert.ok(
      Buffer.byteLength(c.stdout, "utf8") <= PROCESS_EXECUTE_MAX_OUTPUT_BYTES,
    );

    const err = await tool.execute(
      {
        command: node,
        args: ["-e", `process.stderr.write("y".repeat(${n}))`],
      },
      ctx,
    );
    assert.equal(err.ok, true);
    if (!err.ok) return;
    assert.equal(contentOf(err).stderrTruncated, true);
  });

  it("timeout mata el proceso, timedOut, sin retry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-proc-to-"));
    const marker = path.join(dir, "n.txt");
    const tool = createProcessExecuteTool();
    const script = `
      const fs = require("fs");
      fs.appendFileSync(${JSON.stringify(marker)}, "1");
      setTimeout(() => {}, 60000);
    `;
    const first = await tool.execute(
      { command: node, args: ["-e", script], timeoutMs: 1000 },
      ctx,
    );
    const second = await tool.execute(
      { command: node, args: ["-e", script], timeoutMs: 1000 },
      ctx,
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(contentOf(first).timedOut, true);
    assert.equal(contentOf(second).timedOut, true);
    assert.equal(readFileSync(marker, "utf8"), "11");
  });

  it("cwd válido se usa; archivo o inexistente fallan", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-proc-cwd-"));
    const tool = createProcessExecuteTool();
    const ok = await tool.execute(
      {
        command: node,
        args: ["-e", "process.stdout.write(process.cwd())"],
        cwd: dir,
      },
      ctx,
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(path.resolve(contentOf(ok).stdout), path.resolve(dir));

    const filePath = path.join(dir, "f.txt");
    await writeFile(filePath, "x", "utf8");
    const asFile = await tool.execute(
      { command: node, args: ["-e", "0"], cwd: filePath },
      ctx,
    );
    assert.equal(asFile.ok, false);

    const missing = await tool.execute(
      { command: node, args: ["-e", "0"], cwd: path.join(dir, "nope") },
      ctx,
    );
    assert.equal(missing.ok, false);
  });

  it("cwd dentro/fuera de filesystem.root", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-proc-root-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const inside = path.join(root, "in");
    await mkdir(inside);
    const outside = path.join(base, "out");
    await mkdir(outside);
    const tool = createProcessExecuteTool({ root });
    const ok = await tool.execute(
      {
        command: node,
        args: ["-e", "process.stdout.write('ok')"],
        cwd: "in",
      },
      ctx,
    );
    assert.equal(ok.ok, true);
    const bad = await tool.execute(
      { command: node, args: ["-e", "0"], cwd: outside },
      ctx,
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.code, "path_outside_root");
  });

  it("timeoutMs fuera de rango no spawnea", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-proc-range-"));
    const marker = path.join(dir, "m");
    const tool = createProcessExecuteTool();
    const r = await tool.execute(
      {
        command: node,
        args: [
          "-e",
          `require("fs").writeFileSync(${JSON.stringify(marker)}, "1")`,
        ],
        timeoutMs: 50,
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_input");
    assert.equal(existsSync(marker), false);
  });

  it("input inválido no ejecuta", async () => {
    const tool = createProcessExecuteTool();
    const empty = await tool.execute({ command: "" }, ctx);
    assert.equal(empty.ok, false);
    const badArgs = await tool.execute(
      { command: node, args: [1] } as never,
      ctx,
    );
    assert.equal(badArgs.ok, false);
  });

  it("comando inexistente es process_spawn_error", async () => {
    const tool = createProcessExecuteTool();
    const r = await tool.execute(
      { command: "pa-binario-inexistente-8b-xyz" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "process_spawn_error");
  });

  it("no arma shell: 'echo hello' como command falla", async () => {
    const tool = createProcessExecuteTool();
    const r = await tool.execute({ command: "echo hello" }, ctx);
    assert.equal(r.ok, false);
  });

  it("no aplica overlay de env del input", async () => {
    const prev = process.env.PA_PROC_MARK;
    process.env.PA_PROC_MARK = "parent";
    try {
      const tool = createProcessExecuteTool();
      const r = await tool.execute(
        {
          command: node,
          args: ["-e", "process.stdout.write(process.env.PA_PROC_MARK || '')"],
          env: { PA_PROC_MARK: "injected" },
        } as never,
        ctx,
      );
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(contentOf(r).stdout, "parent");
    } finally {
      if (prev === undefined) delete process.env.PA_PROC_MARK;
      else process.env.PA_PROC_MARK = prev;
    }
  });

  it("mcpTimeoutMsForProcessExecute suma holgura", () => {
    assert.equal(
      mcpTimeoutMsForProcessExecute({}),
      PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS + PROCESS_EXECUTE_MCP_SLACK_MS,
    );
    assert.equal(
      mcpTimeoutMsForProcessExecute({ timeoutMs: 80_000 }),
      80_000 + PROCESS_EXECUTE_MCP_SLACK_MS,
    );
  });

  it("MCP roundtrip", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "t", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === PROCESS_EXECUTE.name),
        true,
      );
      const mcp = await client.callTool({
        name: PROCESS_EXECUTE.name,
        arguments: {
          requestId: "rt_p",
          context: { conversationId: "c" },
          input: { command: node, args: ["-e", "process.stdout.write('mcp')"] },
        },
      });
      const text = (mcp as { content: Array<{ text: string }> }).content[0]
        .text;
      const parsed = JSON.parse(text) as {
        requestId: string;
        result: { ok: boolean; content: { stdout: string } };
      };
      assert.equal(parsed.requestId, "rt_p");
      assert.equal(parsed.result.ok, true);
      assert.equal(parsed.result.content.stdout, "mcp");
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
