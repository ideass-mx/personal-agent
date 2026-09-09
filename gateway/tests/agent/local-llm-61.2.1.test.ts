/**
 * PHASE 61.2.1 — instrumentación RUNTIME_HEALTH_TIMEOUT (fake process).
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  classifyRuntimeFailure,
  createLocalRuntimeManager,
  sanitizeRuntimeLog,
  sanitizeRuntimeMetadata,
  type RuntimeManifest,
  type RuntimeStartupTrace,
} from "../../src/local-llm/index.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-61.2.1-"));
process.env.PERSONAL_AGENT_DATA_DIR = tmp;
process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS = "3000";

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function baseManifest(): RuntimeManifest {
  return {
    runtimeId: "llama-server",
    version: "diag-fake",
    platform: process.platform === "win32" ? "win32" : "linux",
    architecture: "x64",
    archiveName: "fake.tar.gz",
    downloadUrl: "https://example.invalid/fake.tar.gz",
    sha256: "c".repeat(64),
    expectedBytes: 10,
    binaryName: "fake-llama-server",
  };
}

async function installFakeBinary(manifest: RuntimeManifest): Promise<string> {
  const { resolveRuntimeStorage, ensureRuntimeDirs } = await import(
    "../../src/local-llm/runtime-storage.ts"
  );
  const storage = resolveRuntimeStorage(manifest, tmp);
  ensureRuntimeDirs(storage);
  fs.writeFileSync(storage.binaryPath, "x");
  fs.chmodSync(storage.binaryPath, 0o755);
  fs.writeFileSync(
    path.join(storage.installRoot, "runtime.json"),
    JSON.stringify({
      runtimeId: manifest.runtimeId,
      version: manifest.version,
      sha256: manifest.sha256,
    }),
  );
  return storage.binaryPath;
}

class FakeChild extends EventEmitter {
  pid = 9_001;
  exitCode: number | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill() {
    this.exitCode = 0;
    this.emit("exit", 0, null);
  }
}

function listenHealth(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      assert.ok(addr && typeof addr !== "string");
      resolve({ server, port: addr.port });
    });
  });
}

describe("PHASE 61.2.1 secret redaction", () => {
  it("G — no registra secretos en logs/metadata", () => {
    const raw =
      'Authorization: Bearer sk-ant-secretTOKEN123 loading model cookie=abc';
    const cleaned = sanitizeRuntimeLog(raw);
    assert.doesNotMatch(cleaned, /sk-ant-secretTOKEN123/);
    assert.doesNotMatch(cleaned, /Bearer sk-ant/);
    assert.match(cleaned, /\[redacted\]/);
    const meta = sanitizeRuntimeMetadata({
      authorization: "secret",
      token: "x",
      note: "loading model",
    });
    assert.equal(meta?.authorization, undefined);
    assert.equal(meta?.token, undefined);
    assert.equal(meta?.note, "loading model");
  });
});

describe("PHASE 61.2.1 LocalRuntimeManager diagnostics", () => {
  it("A — process_spawned en timeline", async () => {
    const modelPath = path.join(tmp, "a.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    const { server, port } = await listenHealth((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    });
    const manifest = baseManifest();
    await installFakeBinary(manifest);
    const child = new FakeChild();
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => child) as unknown as typeof import("node:child_process").spawn,
    });
    await manager.ensureReady(modelPath, {
      diagnosticId: "PA-TESTA",
      executionId: "PA-TESTA",
    });
    const trace = manager.getLastStartupTrace();
    assert.ok(trace);
    assert.ok(trace.events.some((e) => e.event === "process_spawned"));
    assert.equal(trace.childPid, 9001);
    assert.equal(trace.diagnosticId, "PA-TESTA");
    await manager.stop();
    server.close();
  });

  it("B — process crash → runtime_failed + exitCode", async () => {
    const modelPath = path.join(tmp, "b.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    const { server, port } = await listenHealth((_req, res) => {
      res.writeHead(503);
      res.end("loading");
    });
    const manifest = { ...baseManifest(), version: "diag-crash" };
    await installFakeBinary(manifest);
    const child = new FakeChild();
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => child) as unknown as typeof import("node:child_process").spawn,
    });
    queueMicrotask(() => {
      child.exitCode = 1;
      child.emit("exit", 1, null);
    });
    await assert.rejects(
      () => manager.ensureReady(modelPath, { diagnosticId: "PA-TESTB" }),
      (err: unknown) =>
        err instanceof Error &&
        String((err as { code?: string }).code).includes("RUNTIME"),
    );
    const trace = manager.getLastStartupTrace();
    assert.ok(trace);
    assert.ok(
      trace.events.some((e) => e.event === "process_exit") ||
        trace.exitCode === 1,
    );
    assert.ok(
      trace.errorCode === "RUNTIME_HEALTH_TIMEOUT" ||
        trace.events.some((e) => e.event === "runtime_failed"),
    );
    await manager.stop();
    server.close();
  });

  it("C — health success → runtime_ready", async () => {
    const modelPath = path.join(tmp, "c.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    const { server, port } = await listenHealth((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    });
    const manifest = { ...baseManifest(), version: "diag-ready" };
    await installFakeBinary(manifest);
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
    });
    await manager.ensureReady(modelPath, { diagnosticId: "PA-TESTC" });
    const trace = manager.getLastStartupTrace() as RuntimeStartupTrace;
    assert.ok(trace.events.some((e) => e.event === "health_success"));
    assert.ok(trace.events.some((e) => e.event === "runtime_ready"));
    assert.equal(trace.errorCode, null);
    assert.ok(typeof trace.readyAtMs === "number");
    await manager.stop();
    server.close();
  });

  it("D — health timeout → RUNTIME_HEALTH_TIMEOUT", async () => {
    const modelPath = path.join(tmp, "d.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    const { server, port } = await listenHealth((_req, res) => {
      res.writeHead(503);
      res.end("not ready");
    });
    const manifest = { ...baseManifest(), version: "diag-timeout" };
    await installFakeBinary(manifest);
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
    });
    await assert.rejects(
      () => manager.ensureReady(modelPath, { diagnosticId: "PA-TESTD" }),
      (err: unknown) =>
        Boolean(
          err &&
            typeof err === "object" &&
            (err as { code?: string }).code === "RUNTIME_HEALTH_TIMEOUT",
        ),
    );
    const trace = manager.getLastStartupTrace();
    assert.ok(trace);
    assert.equal(trace.errorCode, "RUNTIME_HEALTH_TIMEOUT");
    assert.ok(trace.healthAttempts >= 1);
    assert.equal(manager.state(), "FAILED");
    await manager.stop();
    server.close();
  });

  it("E — health fail then success → READY", async () => {
    const modelPath = path.join(tmp, "e.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    let hits = 0;
    const { server, port } = await listenHealth((_req, res) => {
      hits += 1;
      if (hits < 3) {
        res.writeHead(503);
        res.end("loading");
        return;
      }
      res.writeHead(200);
      res.end("{}");
    });
    const manifest = { ...baseManifest(), version: "diag-recover" };
    await installFakeBinary(manifest);
    process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS = "8000";
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
    });
    await manager.ensureReady(modelPath, { diagnosticId: "PA-TESTE" });
    assert.ok(["READY", "IDLE"].includes(manager.state()));
    const trace = manager.getLastStartupTrace();
    assert.ok(trace);
    assert.ok(trace.healthAttempts >= 3);
    assert.ok(trace.events.some((e) => e.event === "runtime_ready"));
    await manager.stop();
    server.close();
    process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS = "3000";
  });

  it("F — diagnosticId / executionId correlation", async () => {
    const modelPath = path.join(tmp, "f.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));
    const { server, port } = await listenHealth((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    });
    const events: Array<{ event: string; diagnosticId: string; requestId?: string }> =
      [];
    const manifest = { ...baseManifest(), version: "diag-corr" };
    await installFakeBinary(manifest);
    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
      diagnostics: {
        record: (input) => {
          events.push({
            event: input.event,
            diagnosticId: input.diagnosticId,
            requestId: input.requestId,
          });
        },
      },
    });
    await manager.ensureReady(modelPath, {
      diagnosticId: "PA-64B2B87C3FE8",
      executionId: "exec-61-2-1",
    });
    const trace = manager.getLastStartupTrace();
    assert.equal(trace?.diagnosticId, "PA-64B2B87C3FE8");
    assert.equal(trace?.executionId, "exec-61-2-1");
    assert.ok(events.some((e) => e.diagnosticId === "PA-64B2B87C3FE8"));
    assert.ok(events.some((e) => e.event === "process_spawned"));
    assert.ok(events.some((e) => e.event === "runtime_ready"));
    await manager.stop();
    server.close();
  });

  it("classify — 503 loading → caso D o G", () => {
    const fake: RuntimeStartupTrace = {
      diagnosticId: "PA-X",
      executionId: "PA-X",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      healthTimeoutMs: 120_000,
      binaryPath: "/x",
      binaryExists: true,
      modelPath: "/m.gguf",
      modelExists: true,
      modelBytes: 100,
      args: [],
      host: "127.0.0.1",
      port: 1,
      childPid: 1,
      exitCode: null,
      exitSignal: null,
      processAliveAtTimeout: true,
      stdoutSummary: "loading model",
      stderrSummary: "",
      healthAttempts: 10,
      healthLastStatus: 503,
      healthLastError: null,
      readyAtMs: null,
      failedAtMs: 120_000,
      errorCode: "RUNTIME_HEALTH_TIMEOUT",
      ramBeforeMb: 1000,
      ramAfterMb: 800,
      events: [
        { tMs: 0, at: "", event: "process_spawned" },
        {
          tMs: 100,
          at: "",
          event: "health_attempt",
          metadata: { httpStatus: 503 },
        },
        { tMs: 120_000, at: "", event: "runtime_failed" },
      ],
    };
    const cls = classifyRuntimeFailure(fake);
    assert.ok(
      cls.case === "D_LISTENING_MODEL_LOADING" ||
        cls.case === "G_TIMEOUT_TOO_SHORT",
    );
  });
});
