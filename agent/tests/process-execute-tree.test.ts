/**
 * 12B: árbol de process.execute. No duplica process-execute.test.ts
 * (normal, timeout, ENOENT, 64KiB, MCP slack).
 *
 * Windows (win32): se omiten nieto+timeout, shutdown y disconnect MCP
 * con afirmación de árbol. No se simula Job Object.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import {
  PROCESS_EXECUTE,
  abortActiveProcessExecutes,
  createProcessExecuteTool,
  processExecuteUsesProcessGroup,
} from "../src/tools/process-execute.ts";

const ctx = { conversationId: "c" };
const node = process.execPath;
const posix = processExecuteUsesProcessGroup();

function contentOf(result: { ok: true; content: unknown }) {
  return result.content as {
    timedOut: boolean;
    exitCode: number | null;
    stdout: string;
  };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(
  pred: () => boolean | Promise<boolean>,
  ms: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
}

const grandchildScript = (marker: string) => `
const { spawn } = require("node:child_process");
const inner = ${JSON.stringify(
  `const fs=require("fs"); const m=${JSON.stringify(marker)};
setInterval(()=>{ try { fs.writeFileSync(m, String(process.pid)); } catch {} }, 40);`,
)};
spawn(process.execPath, ["-e", inner], { stdio: "ignore" });
setInterval(() => {}, 1000);
`;

describe("12B process.execute árbol de procesos", () => {
  it("proceso normal no cambia el contrato", async () => {
    const tool = createProcessExecuteTool();
    const result = await tool.execute(
      { command: node, args: ["-e", "process.stdout.write('ok')"] },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(contentOf(result).stdout, "ok");
    assert.equal(contentOf(result).timedOut, false);
  });

  it("timeout mata al nieto que permanece en el process group", async (t) => {
    if (!posix) {
      t.skip("Windows: sin Job Object; no se afirma matanza de nietos");
      return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), "pa-12b-gc-"));
    const marker = path.join(dir, "pid");
    const tool = createProcessExecuteTool();
    const result = await tool.execute(
      {
        command: node,
        args: ["-e", grandchildScript(marker)],
        timeoutMs: 1000,
      },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(contentOf(result).timedOut, true);
    assert.equal(existsSync(marker), true);
    const pid = Number((await readFile(marker, "utf8")).trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    const dead = await waitUntil(() => !pidAlive(pid), 2_000);
    assert.equal(dead, true);
    const before = (await stat(marker)).mtimeMs;
    await new Promise((r) => setTimeout(r, 200));
    const after = (await stat(marker)).mtimeMs;
    assert.equal(after, before);
  });

  it("dos process.execute concurrentes no se matan entre sí", async () => {
    const tool = createProcessExecuteTool();
    const timed = tool.execute(
      {
        command: node,
        args: ["-e", "setTimeout(()=>{}, 30000)"],
        timeoutMs: 1000,
      },
      ctx,
    );
    const quick = tool.execute(
      {
        command: node,
        args: ["-e", "process.stdout.write('alive')"],
        timeoutMs: 5_000,
      },
      ctx,
    );
    const [a, b] = await Promise.all([timed, quick]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(contentOf(a).timedOut, true);
    assert.equal(contentOf(b).timedOut, false);
    assert.equal(contentOf(b).stdout, "alive");
  });

  it("shutdown del Agent mata una ejecución activa", async (t) => {
    if (!posix) {
      t.skip("Windows: kill de pid raíz; árbol no verificado");
      return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), "pa-12b-sd-"));
    const marker = path.join(dir, "pid");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "12b-sd", version: "0.0.0" });
    await client.connect(clientT);
    const pending = client.callTool({
      name: PROCESS_EXECUTE.name,
      arguments: {
        requestId: "rt_sd",
        context: { conversationId: "c" },
        input: {
          command: node,
          args: ["-e", grandchildScript(marker)],
          timeoutMs: 30_000,
        },
      },
    }).catch(() => undefined);
    const wrote = await waitUntil(() => existsSync(marker), 3_000);
    assert.equal(wrote, true);
    const pid = Number((await readFile(marker, "utf8")).trim());
    await agent.shutdown();
    await client.close().catch(() => undefined);
    await pending;
    const dead = await waitUntil(() => !pidAlive(pid), 2_000);
    assert.equal(dead, true);
  });

  it("MCP disconnect dispara cleanup de process.execute activo", async (t) => {
    if (!posix) {
      t.skip("Windows: árbol no verificado");
      return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), "pa-12b-dc-"));
    const marker = path.join(dir, "pid");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "12b-dc", version: "0.0.0" });
    await client.connect(clientT);
    const pending = client.callTool({
      name: PROCESS_EXECUTE.name,
      arguments: {
        requestId: "rt_dc",
        context: { conversationId: "c" },
        input: {
          command: node,
          args: ["-e", grandchildScript(marker)],
          timeoutMs: 30_000,
        },
      },
    }).catch(() => undefined);
    const wrote = await waitUntil(() => existsSync(marker), 3_000);
    assert.equal(wrote, true);
    const pid = Number((await readFile(marker, "utf8")).trim());
    await client.close();
    await serverT.close();
    await pending;
    const dead = await waitUntil(() => !pidAlive(pid), 3_000);
    await agent.shutdown().catch(() => undefined);
    assert.equal(dead, true);
  });

  it("abortActiveProcessExecutes es no-op sin hijos", async () => {
    await abortActiveProcessExecutes();
  });

  it("processExecuteUsesProcessGroup solo fuera de win32", () => {
    assert.equal(processExecuteUsesProcessGroup("win32"), false);
    assert.equal(processExecuteUsesProcessGroup("linux"), true);
    assert.equal(processExecuteUsesProcessGroup("darwin"), true);
  });
});
