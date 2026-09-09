/**
 * Diagnóstico del flujo de instalación local (PHASE 61.2.2).
 *
 *   npm run research:diagnose:61.2.2
 *
 * Live (descarga real; puede tardar minutos):
 *   PERSONAL_AGENT_LOCAL_LLM_LIVE=1 npm run research:diagnose:61.2.2
 *
 * No deja procesos llama-server huérfanos (esta fase no arranca el servidor
 * durante install; el startup es post-chat / ensureReady).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  createLocalModelManager,
  createLocalRuntimeManager,
  formatInstallDurationSummary,
  getLocalModelVariant,
  resolveProductDataRoot,
  resolveRuntimeManifest,
} from "../src/local-llm/index.ts";
import {
  beginModelInstall,
  clearModelInstallProgress,
  completeModelInstall,
  failModelInstall,
  getModelInstallSnapshot,
  setModelInstallPhase,
  updateModelDownloadProgress,
} from "../src/local-llm/install-progress.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outJson = path.join(
  repoRoot,
  "research/phase-61.2.2-local-model-installation.json",
);

const LIVE = process.env.PERSONAL_AGENT_LOCAL_LLM_LIVE === "1";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const manifest = resolveRuntimeManifest();
  const variant = getLocalModelVariant(
    DEFAULT_LOCAL_MODEL_ID,
    DEFAULT_LOCAL_VARIANT_ID,
  );
  const manager = createLocalModelManager();
  const rt = createLocalRuntimeManager();
  const already = manager.isInstalled(DEFAULT_LOCAL_MODEL_ID);

  const artifact: Record<string, unknown> = {
    phase: "61.2.2",
    timestamp: startedAt,
    platform: process.platform,
    arch: process.arch,
    dataRoot: resolveProductDataRoot(),
    live: LIVE,
    modelId: DEFAULT_LOCAL_MODEL_ID,
    modelSize: variant?.expectedBytes ?? null,
    quantization: variant?.quantization ?? null,
    flowDocumented: {
      variant: "B-ish",
      steps: [
        "preparing",
        "installing_runtime (si falta binario)",
        "downloading GGUF",
        "verifying SHA-256",
        "setup READY",
      ],
      note:
        "POST /v1/local-llm/install NO arranca llama-server ni hace health; eso ocurre en el primer chat (ensureReady).",
      uiProblem:
        "Antes: await install() + poll que solo veía downloading tras runtime; runtime install dejaba la UI en «Preparando…» indefinido.",
    },
    runtimeAlreadyInstalled: rt.isInstalled(),
    modelAlreadyInstalled: already,
    cancelSupported: false,
    resumeSupported: false,
  };

  if (!LIVE) {
    // Simulación de timeline (sin red) para validar instrumentación.
    clearModelInstallProgress();
    beginModelInstall({
      modelId: DEFAULT_LOCAL_MODEL_ID,
      displayName: "Qwen3 4B",
    });
    setModelInstallPhase("installing_runtime");
    await sleep(50);
    setModelInstallPhase("downloading");
    for (const ratio of [0.25, 0.5, 0.75, 1]) {
      updateModelDownloadProgress({
        bytesReceived: Math.round((variant?.expectedBytes ?? 100) * ratio),
        bytesTotal: variant?.expectedBytes ?? 100,
        ratio,
      });
      await sleep(20);
    }
    setModelInstallPhase("verifying");
    await sleep(30);
    completeModelInstall();
    const snap = getModelInstallSnapshot();
    artifact.simulation = true;
    artifact.finalStatus = snap?.phase;
    artifact.timeline = snap?.events;
    artifact.stageDurationsMs = snap?.stageDurationsMs;
    artifact.totalDuration = snap?.elapsedMs;
    artifact.conclusion =
      "LIVE=0: instrumentación OK. Ejecutar con PERSONAL_AGENT_LOCAL_LLM_LIVE=1 en el host real para medir bottleneck.";
    if (snap) console.log(formatInstallDurationSummary(snap));
    writeJson(artifact);
    clearModelInstallProgress();
    return;
  }

  if (already) {
    artifact.finalStatus = "skipped_already_installed";
    artifact.conclusion =
      "Modelo ya instalado — no se re-descarga (comportamiento esperado).";
    writeJson(artifact);
    console.log(artifact.conclusion);
    return;
  }

  clearModelInstallProgress();
  beginModelInstall({
    modelId: DEFAULT_LOCAL_MODEL_ID,
    displayName: "Qwen3 4B",
  });
  const t0 = Date.now();
  try {
    if (!rt.isInstalled()) {
      setModelInstallPhase("installing_runtime");
      const tRt = Date.now();
      await rt.install({
        skipHash: process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH === "1",
      });
      artifact.runtimeInstallDuration = Date.now() - tRt;
    } else {
      artifact.runtimeInstallDuration = 0;
    }
    setModelInstallPhase("downloading");
    const tDl = Date.now();
    await manager.install(DEFAULT_LOCAL_MODEL_ID, DEFAULT_LOCAL_VARIANT_ID, {
      skipHash: process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH === "1",
      onDetail: (p) => {
        if (p.phase === "validating") {
          setModelInstallPhase("verifying");
          return;
        }
        updateModelDownloadProgress({
          bytesReceived: p.bytesReceived ?? 0,
          bytesTotal: p.bytesTotal,
          ratio: p.ratio,
        });
      },
    });
    artifact.downloadAndVerifyDuration = Date.now() - tDl;
    completeModelInstall();
    const snap = getModelInstallSnapshot();
    artifact.finalStatus = "complete";
    artifact.timeline = snap?.events;
    artifact.stageDurationsMs = snap?.stageDurationsMs;
    artifact.totalDuration = Date.now() - t0;
    artifact.runtimeStartupDuration = null;
    artifact.healthDuration = null;
    artifact.note =
      "Install no inicia llama-server; medir startup con research:diagnose:61.2.1";
    if (snap) console.log(formatInstallDurationSummary(snap));
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "MODEL_DOWNLOAD_FAILED";
    failModelInstall(
      code,
      err instanceof Error ? err.message : "install_failed",
    );
    const snap = getModelInstallSnapshot();
    artifact.finalStatus = "failed";
    artifact.failureStage = snap?.phase;
    artifact.errorCode = code;
    artifact.timeline = snap?.events;
    artifact.stageDurationsMs = snap?.stageDurationsMs;
    artifact.totalDuration = Date.now() - t0;
    process.exitCode = 1;
  } finally {
    writeJson(artifact);
    clearModelInstallProgress();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function writeJson(artifact: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outJson}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
