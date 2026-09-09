/**
 * PHASE 61 — Local LLM: hardware, advisor, manager, provider, selection.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  advisePrimaryModel,
  createFakeLocalRuntime,
  createLocalModelManager,
  createLocalProvider,
  DEFAULT_LOCAL_MODEL_ID,
  detectHardware,
  resolveLlmSelection,
  writeLlmPreference,
} from "../../src/local-llm/index.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-61-local-"));
process.env.PERSONAL_AGENT_DATA_DIR = tmp;
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_LOCAL_LLM_FAKE = "1";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("PHASE 61 HardwareDetector", () => {
  it("CPU only profile has cores and memory", () => {
    const hw = detectHardware();
    assert.ok(hw.cpu.cores >= 1);
    assert.ok(hw.memory.totalGb > 0);
    assert.equal(typeof hw.os.platform, "string");
  });

  it("acepta overrides 8/16/32 GB", () => {
    for (const gb of [8, 16, 32]) {
      const hw = detectHardware({
        memory: { totalGb: gb, availableGb: gb - 2 },
      });
      assert.equal(hw.memory.totalGb, gb);
    }
  });
});

describe("PHASE 61 ModelAdvisor", () => {
  it("recomienda Qwen3 4B en máquina compatible", () => {
    const rec = advisePrimaryModel(
      detectHardware({
        memory: { totalGb: 16, availableGb: 10 },
        storage: { freeGb: 40 },
      }),
    );
    assert.equal(rec.modelId, DEFAULT_LOCAL_MODEL_ID);
    assert.ok(
      rec.suitability === "recommended" || rec.suitability === "compatible",
    );
  });

  it("compatible en hardware ajustado", () => {
    const rec = advisePrimaryModel(
      detectHardware({
        memory: { totalGb: 6, availableGb: 3 },
        storage: { freeGb: 20 },
      }),
    );
    assert.equal(rec.modelId, DEFAULT_LOCAL_MODEL_ID);
    assert.ok(
      rec.suitability === "compatible" ||
        rec.suitability === "not_recommended",
    );
  });
});

describe("PHASE 61 LocalModelManager", () => {
  it("not installed → install (fake file) → active", async () => {
    const manager = createLocalModelManager();
    assert.equal(manager.isInstalled(DEFAULT_LOCAL_MODEL_ID), false);
    const gguf = path.join(tmp, "tiny.gguf");
    fs.writeFileSync(gguf, Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(64)]));
    const status = await manager.install(DEFAULT_LOCAL_MODEL_ID, undefined, {
      sourceFile: gguf,
      skipHash: true,
    });
    assert.equal(status.state, "active");
    assert.equal(manager.isInstalled(DEFAULT_LOCAL_MODEL_ID), true);
    assert.ok(manager.getActive());
  });

  it("reporta progreso durante descarga HTTPS", async () => {
    const manager = createLocalModelManager();
    const payload = Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(200_000)]);
    const ratios: number[] = [];
    const status = await manager.install(DEFAULT_LOCAL_MODEL_ID, undefined, {
      skipHash: true,
      onProgress: (r) => ratios.push(r),
      fetchImpl: async () =>
        new Response(payload, {
          status: 200,
          headers: { "content-length": String(payload.byteLength) },
        }),
    });
    assert.equal(status.state, "active");
    assert.ok(ratios.length >= 1);
    assert.ok(ratios[0]! > 0);
    assert.ok(ratios[ratios.length - 1]! <= 1);
    assert.equal(manager.getInstallProgress(), null);
  });
});

describe("PHASE 61 LocalProvider", () => {
  it("streaming + system prompt", async () => {
    const manager = createLocalModelManager();
    const runtime = createFakeLocalRuntime({ reply: "Hola, soy tu Personal Agent." });
    const provider = createLocalProvider({ manager, runtime });
    let text = "";
    for await (const ev of provider.stream({
      system: "Eres el agente.",
      messages: [{ role: "user", content: "Hola" }],
    })) {
      if (ev.type === "text_delta") text += ev.text;
    }
    assert.match(text, /Personal Agent/);
  });

  it("MODEL_NOT_INSTALLED si no hay modelo", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "pa-61-empty-"));
    process.env.PERSONAL_AGENT_DATA_DIR = empty;
    const manager = createLocalModelManager();
    const runtime = createFakeLocalRuntime();
    const provider = createLocalProvider({ manager, runtime });
    await assert.rejects(async () => {
      for await (const _ of provider.stream({
        messages: [{ role: "user", content: "x" }],
      })) {
        /* */
      }
    });
    process.env.PERSONAL_AGENT_DATA_DIR = tmp;
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe("PHASE 61 default selection", () => {
  it("nueva instalación → provider local", () => {
    writeLlmPreference({
      provider: "local",
      modelId: DEFAULT_LOCAL_MODEL_ID,
    });
    const manager = createLocalModelManager();
    const sel = resolveLlmSelection(manager);
    assert.equal(sel.provider, "local");
    assert.equal(sel.modelId, DEFAULT_LOCAL_MODEL_ID);
  });
});
