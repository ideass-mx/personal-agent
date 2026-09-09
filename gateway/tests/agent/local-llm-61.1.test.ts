/**
 * PHASE 61.1 — LocalRuntimeManager + managed llama-server (fake process).
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  createLocalRuntimeManager,
  createManagedLlamaServerRuntimeWithManager,
  installLlamaServerRuntime,
  resolveRuntimeManifest,
  type RuntimeManifest,
} from "../../src/local-llm/index.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-61.1-"));
process.env.PERSONAL_AGENT_DATA_DIR = tmp;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function fakeManifest(): RuntimeManifest {
  const base = resolveRuntimeManifest() ?? {
    runtimeId: "llama-server",
    version: "test",
    platform: process.platform === "win32" ? "win32" : "linux",
    architecture: "x64",
    archiveName: "fake.tar.gz",
    downloadUrl: "https://example.invalid/fake.tar.gz",
    sha256: "a".repeat(64),
    expectedBytes: 10,
    binaryName: process.platform === "win32" ? "llama-server.exe" : "llama-server",
  };
  return { ...base, version: "test-fake", sha256: "b".repeat(64) };
}

describe("PHASE 61.1 runtime manifest", () => {
  it("resuelve manifest CPU para la plataforma actual (x64)", () => {
    const m = resolveRuntimeManifest("linux", "x64");
    assert.ok(m);
    assert.equal(m.runtimeId, "llama-server");
    assert.match(m.downloadUrl, /github\.com\/ggml-org\/llama\.cpp/);
    assert.equal(m.sha256.length, 64);
  });

  it("no inventa CUDA como runtime por defecto", () => {
    const m = resolveRuntimeManifest("win32", "x64");
    assert.ok(m);
    assert.match(m.archiveName, /cpu/);
    assert.doesNotMatch(m.archiveName, /cuda/i);
  });
});

describe("PHASE 61.1 runtime installer validation", () => {
  it("rechaza SHA incorrecto", async () => {
    const manifest = fakeManifest();
    const archive = path.join(tmp, "bad.bin");
    fs.writeFileSync(archive, "not-a-real-archive");
    await assert.rejects(
      () =>
        installLlamaServerRuntime({
          manifest: { ...manifest, expectedBytes: archive.length },
          sourceArchive: archive,
          skipHash: false,
        }),
      (err: unknown) =>
        err instanceof Error &&
        String((err as { code?: string }).code).includes("RUNTIME"),
    );
  });
});

describe("PHASE 61.1 LocalRuntimeManager lifecycle (fake spawn)", () => {
  it("start → health READY → stop", async () => {
    const modelPath = path.join(tmp, "model.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(32)]));

    // Mini HTTP health server que simula llama-server
    const healthServer = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      healthServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = healthServer.address();
    assert.ok(addr && typeof addr !== "string");
    const port = addr.port;

    const binary = path.join(tmp, "fake-llama-server");
    fs.writeFileSync(binary, "#!/bin/sh\nwhile true; do sleep 1; done\n");
    fs.chmodSync(binary, 0o755);

    const manifest: RuntimeManifest = {
      ...fakeManifest(),
      binaryName: path.basename(binary),
      extractPrefix: undefined,
      version: "fake-proc",
    };

    // Instalar “binario” en storage esperado
    const { resolveRuntimeStorage, ensureRuntimeDirs } = await import(
      "../../src/local-llm/runtime-storage.ts"
    );
    const storage = resolveRuntimeStorage(manifest, tmp);
    ensureRuntimeDirs(storage);
    fs.copyFileSync(binary, storage.binaryPath);
    fs.writeFileSync(
      path.join(storage.installRoot, "runtime.json"),
      JSON.stringify({
        runtimeId: manifest.runtimeId,
        version: manifest.version,
        sha256: manifest.sha256,
        preflightOk: true,
      }),
    );

    class FakeChild extends EventEmitter {
      pid = 4242;
      exitCode: number | null = null;
      stdout = new EventEmitter();
      stderr = new EventEmitter();
      kill() {
        this.exitCode = 0;
        this.emit("exit", 0, null);
      }
    }

    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
      fetchImpl: fetch,
    });

    assert.equal(manager.isInstalled(), true);
    const { baseUrl } = await manager.ensureReady(modelPath);
    assert.equal(baseUrl, `http://127.0.0.1:${port}/v1`);
    assert.ok(["READY", "IDLE"].includes(manager.state()));

    manager.markBusy();
    assert.equal(manager.state(), "BUSY");
    manager.markIdle();
    assert.equal(manager.state(), "IDLE");

    await manager.stop();
    assert.equal(manager.state(), "STOPPED");

    healthServer.close();
  });
});

describe("PHASE 61.1 managed runtime serial generate (mock HTTP)", () => {
  it("streaming chunks vía OpenAI SSE", async () => {
    const modelPath = path.join(tmp, "model2.gguf");
    fs.writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(8)]));

    const server = http.createServer(async (req, res) => {
      if (req.url === "/health") {
        res.writeHead(200);
        res.end("{}");
        return;
      }
      if (req.url === "/v1/chat/completions") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Hola" } }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "!" } }] })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const port = addr.port;

    const binary = path.join(tmp, "fake-bin2");
    fs.writeFileSync(binary, "x");
    fs.chmodSync(binary, 0o755);
    const manifest: RuntimeManifest = {
      ...fakeManifest(),
      version: "fake-gen",
      binaryName: path.basename(binary),
      extractPrefix: undefined,
    };
    const { resolveRuntimeStorage, ensureRuntimeDirs } = await import(
      "../../src/local-llm/runtime-storage.ts"
    );
    const storage = resolveRuntimeStorage(manifest, tmp);
    ensureRuntimeDirs(storage);
    fs.copyFileSync(binary, storage.binaryPath);
    fs.writeFileSync(
      path.join(storage.installRoot, "runtime.json"),
      JSON.stringify({
        runtimeId: manifest.runtimeId,
        version: manifest.version,
        sha256: manifest.sha256,
        preflightOk: true,
      }),
    );

    class FakeChild extends EventEmitter {
      pid = 7;
      exitCode: number | null = null;
      stdout = new EventEmitter();
      stderr = new EventEmitter();
      kill() {
        this.exitCode = 0;
        this.emit("exit", 0, null);
      }
    }

    const manager = createLocalRuntimeManager({
      manifest,
      port,
      spawnFn: (() => new FakeChild()) as unknown as typeof import("node:child_process").spawn,
    });
    const { runtime } = createManagedLlamaServerRuntimeWithManager(manager);
    await runtime.ensureReady(modelPath);
    let text = "";
    for await (const ev of runtime.generate({
      messages: [{ role: "user", content: "Hola" }],
    })) {
      if (ev.type === "text_delta") text += ev.text;
    }
    assert.equal(text, "Hola!");
    await runtime.shutdown();
    server.close();
  });
});
