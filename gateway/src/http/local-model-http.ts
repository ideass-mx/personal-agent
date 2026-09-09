/**
 * HTTP Local Models — hardware, advisor, install, status (PHASE 61).
 * Sin secretos; sin detalles técnicos de GGUF en respuestas de producto.
 */
import type { Context, Hono } from "hono";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireLocalProductSetup } from "./owner-auth.ts";
import {
  advisePrimaryModel,
  createLocalModelManager,
  createLocalRuntimeManager,
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  detectHardware,
  listLocalModelCatalog,
  LocalModelError,
  writeLlmPreference,
  defaultLocalPreference,
  resolveRuntimeManifest,
  type LocalModelManager,
} from "../local-llm/index.ts";
import {
  beginModelInstall,
  clearModelInstallProgress,
  completeModelInstall,
  failModelInstall,
  getModelInstallSnapshot,
  setModelInstallPhase,
  updateModelDownloadProgress,
} from "../local-llm/install-progress.ts";
import {
  getSetupState,
  transitionSetupState,
} from "../setup/setup-store.ts";
import { SetupStates } from "../setup/types.ts";

export function mountLocalModelHttp(
  app: Hono,
  deps: {
    hubToken: string;
    manager?: LocalModelManager;
  },
): void {
  const manager = deps.manager ?? createLocalModelManager();
  const requireSetup = (c: Context) => {
    const gated = requireLocalProductSetup(c, deps.hubToken);
    if (gated instanceof Response) return gated;
    return null;
  };

  app.get("/v1/local-llm/hardware", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const profile = detectHardware();
    return c.json({
      ok: true,
      hardware: {
        memoryGb: profile.memory.totalGb,
        availableMemoryGb: profile.memory.availableGb,
        cpuCores: profile.cpu.cores,
        platform: profile.os.platform,
        hasGpu: Boolean(profile.gpu),
        freeStorageGb: profile.storage.freeGb,
      },
    });
  });

  app.get("/v1/local-llm/recommendation", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const hardware = detectHardware();
    const primary = advisePrimaryModel(hardware);
    const entry = listLocalModelCatalog().find((e) => e.id === primary.modelId);
    return c.json({
      ok: true,
      recommendation: {
        modelId: primary.modelId,
        displayName: entry?.displayName ?? primary.modelId,
        tierLabel: entry?.tierLabel ?? "",
        description: entry?.description ?? "",
        suitability: primary.suitability,
        reason: primary.reason,
        estimatedMemoryGb: primary.estimatedMemoryGb,
      },
      hardware: {
        memoryGb: hardware.memory.totalGb,
        cpuCores: hardware.cpu.cores,
      },
    });
  });

  app.get("/v1/local-llm/models", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const catalog = listLocalModelCatalog().map((e) => ({
      id: e.id,
      displayName: e.displayName,
      description: e.description,
      tierLabel: e.tierLabel,
      capabilities: {
        streaming: e.capabilities.streaming,
        toolCalling: e.capabilities.toolCalling,
        contextWindow: e.capabilities.contextWindow,
      },
    }));
    const status = manager.listStatus();
    const active = manager.getActive();
    return c.json({
      ok: true,
      catalog,
      installed: status,
      active: active
        ? { modelId: active.modelId, variantId: active.variantId }
        : null,
    });
  });

  app.get("/v1/local-llm/status", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const active = manager.getActive();
    const inflight = manager.getInstallProgress();
    const install = getModelInstallSnapshot();
    const entry = listLocalModelCatalog().find(
      (e) =>
        e.id ===
        (install?.modelId ||
          inflight?.modelId ||
          active?.modelId ||
          DEFAULT_LOCAL_MODEL_ID),
    );
    const rtManager = createLocalRuntimeManager();
    const manifest = resolveRuntimeManifest();
    let modelState: string = active ? "ready" : "not_installed";
    let progressPct: number | undefined;
    if (install && install.phase !== "complete") {
      modelState =
        install.phase === "verifying"
          ? "validating"
          : install.phase === "downloading"
            ? "downloading"
            : install.phase === "failed"
              ? "failed"
              : install.phase === "installing_runtime" ||
                  install.phase === "validating_runtime" ||
                  install.phase === "starting_model" ||
                  install.phase === "preparing"
                ? "downloading"
                : modelState;
      if (typeof install.progress === "number") {
        progressPct = install.progress;
      }
    } else if (
      inflight &&
      (inflight.state === "downloading" ||
        inflight.state === "validating" ||
        inflight.state === "failed")
    ) {
      modelState = inflight.state;
      if (typeof inflight.progress === "number") {
        progressPct = Math.round(Math.min(1, Math.max(0, inflight.progress)) * 100);
      }
    }
    return c.json({
      ok: true,
      provider: "local",
      ready: Boolean(active) && rtManager.isInstalled(),
      model: {
        id:
          install?.modelId ||
          inflight?.modelId ||
          active?.modelId ||
          DEFAULT_LOCAL_MODEL_ID,
        displayName: entry?.displayName ?? "Qwen3 4B",
        state: modelState,
        ...(progressPct !== undefined ? { progress: progressPct } : {}),
      },
      install: install
        ? {
            phase: install.phase,
            displayName: install.displayName,
            progress: install.progress,
            bytesReceived: install.bytesReceived,
            bytesTotal: install.bytesTotal,
            bytesPerSecond: install.bytesPerSecond,
            etaSeconds: install.etaSeconds,
            elapsedMs: install.elapsedMs,
            errorCode: install.errorCode,
            errorMessage: install.errorMessage,
            stageDurationsMs: install.stageDurationsMs,
          }
        : null,
      runtime: {
        id: manifest?.runtimeId ?? "llama-server",
        version: manifest?.version ?? null,
        installed: rtManager.isInstalled(),
        state: rtManager.state(),
        official: "llama-server",
        experimental: "node-llama-cpp",
      },
    });
  });

  app.get("/v1/local-llm/runtime", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const rtManager = createLocalRuntimeManager();
    const manifest = resolveRuntimeManifest();
    return c.json({
      ok: true,
      installed: rtManager.isInstalled(),
      state: rtManager.state(),
      manifest: manifest
        ? {
            runtimeId: manifest.runtimeId,
            version: manifest.version,
            platform: manifest.platform,
            architecture: manifest.architecture,
          }
        : null,
    });
  });

  app.post("/v1/local-llm/runtime/install", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const rtManager = createLocalRuntimeManager();
    try {
      await rtManager.install({
        skipHash: process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH === "1",
      });
      return c.json({
        ok: true,
        installed: true,
        state: rtManager.state(),
      });
    } catch (err) {
      if (err instanceof LocalModelError) {
        return c.json(httpErrorBody(err.code, err.userMessage), 400);
      }
      return c.json(
        httpErrorBody(
          "RUNTIME_NOT_INSTALLED",
          "No pudimos instalar el motor local.",
        ),
        400,
      );
    }
  });

  app.post("/v1/local-llm/install", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      modelId?: string;
      variantId?: string;
    };
    const modelId = body.modelId || DEFAULT_LOCAL_MODEL_ID;
    const variantId = body.variantId || DEFAULT_LOCAL_VARIANT_ID;
    const entry = listLocalModelCatalog().find((e) => e.id === modelId);
    const displayName = entry?.displayName ?? "Qwen3 4B";
    beginModelInstall({ modelId, displayName });
    try {
      // 1) Modelo: descarga + SHA-256 (sin arrancar el motor).
      setModelInstallPhase("downloading");
      const status = await manager.install(modelId, variantId, {
        skipHash: process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH === "1",
        onDetail: (p) => {
          if (p.phase === "validating") {
            setModelInstallPhase("verifying");
            return;
          }
          setModelInstallPhase("downloading");
          updateModelDownloadProgress({
            bytesReceived: p.bytesReceived ?? 0,
            bytesTotal: p.bytesTotal,
            ratio: p.ratio,
          });
        },
      });

      // 2) Runtime: extract + sidecars + preflight `--version` (no GGUF).
      const rtManager = createLocalRuntimeManager();
      setModelInstallPhase("installing_runtime");
      await rtManager.install({
        skipHash: process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH === "1",
      });
      setModelInstallPhase("validating_runtime");
      if (!rtManager.isInstalled()) {
        throw new LocalModelError(
          "RUNTIME_VALIDATION_FAILED",
          "El modelo se descargó correctamente, pero el motor local no pudo iniciarse.",
        );
      }

      // 3) Arranque real con el GGUF + /health (diagnóstico separado del preflight).
      const active = manager.getActive();
      if (!active?.path) {
        throw new LocalModelError(
          "MODEL_NOT_INSTALLED",
          "El archivo del modelo no está disponible tras la descarga.",
        );
      }
      setModelInstallPhase("starting_model");
      await rtManager.ensureReady(active.path);

      writeLlmPreference(defaultLocalPreference());
      try {
        let record = getSetupState();
        if (
          record.state === SetupStates.AGENT_READY ||
          record.state === SetupStates.ONBOARDING
        ) {
          record = transitionSetupState(SetupStates.LLM_REQUIRED, {
            llmProvider: "local",
          });
        }
        if (
          record.state === SetupStates.LLM_REQUIRED ||
          record.state === SetupStates.LLM_CONFIGURATION_ERROR
        ) {
          record = transitionSetupState(SetupStates.LLM_CONNECTED, {
            llmProvider: "local",
          });
        }
        if (record.state === SetupStates.LLM_CONNECTED) {
          transitionSetupState(SetupStates.VERIFYING, { llmProvider: "local" });
          transitionSetupState(SetupStates.VERIFIED, { llmProvider: "local" });
          transitionSetupState(SetupStates.READY, { llmProvider: "local" });
        } else if (record.state === SetupStates.VERIFIED) {
          transitionSetupState(SetupStates.READY, { llmProvider: "local" });
        }
      } catch {
        /* setup transitions best-effort */
      }
      completeModelInstall();
      const snap = getModelInstallSnapshot();
      return c.json({
        ok: true,
        model: {
          id: status.modelId,
          displayName: status.displayName,
          state: status.state,
        },
        install: snap
          ? {
              phase: snap.phase,
              elapsedMs: snap.elapsedMs,
              stageDurationsMs: snap.stageDurationsMs,
            }
          : null,
      });
    } catch (err) {
      if (err instanceof LocalModelError) {
        failModelInstall(err.code, err.userMessage);
        const technical =
          err.code === "RUNTIME_DEPENDENCY_MISSING"
            ? "Código técnico: 0xC0000135 (STATUS_DLL_NOT_FOUND)"
            : err.cause &&
                typeof err.cause === "object" &&
                err.cause !== null &&
                "diagnostics" in err.cause
              ? String(
                  (err.cause as { diagnostics?: string }).diagnostics ?? "",
                )
              : undefined;
        return c.json(
          {
            error: {
              code: err.code,
              message:
                err.code === "RUNTIME_DEPENDENCY_MISSING" ||
                err.code === "RUNTIME_VALIDATION_FAILED" ||
                err.code === "RUNTIME_START_FAILED" ||
                err.code === "RUNTIME_NOT_INSTALLED"
                  ? "El modelo se descargó correctamente, pero el motor local no pudo iniciarse."
                  : err.userMessage,
              title: err.code.startsWith("RUNTIME_")
                ? "No pudimos preparar el motor local"
                : undefined,
              technical: technical || undefined,
              modelOk:
                err.code.startsWith("RUNTIME_") ||
                err.code === "MODEL_LOAD_FAILED",
            },
          },
          400,
        );
      }
      failModelInstall(
        "MODEL_DOWNLOAD_FAILED",
        "No pudimos descargar el modelo.",
      );
      return c.json(
        httpErrorBody(
          "MODEL_DOWNLOAD_FAILED",
          "No pudimos descargar el modelo.",
        ),
        400,
      );
    } finally {
      // Mantener snapshot unos segundos para el último poll; limpiar lazy.
      setTimeout(() => clearModelInstallProgress(), 15_000);
    }
  });

  app.post("/v1/local-llm/activate", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      modelId?: string;
      variantId?: string;
    };
    try {
      manager.setActive(
        body.modelId || DEFAULT_LOCAL_MODEL_ID,
        body.variantId || DEFAULT_LOCAL_VARIANT_ID,
      );
      writeLlmPreference(defaultLocalPreference());
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof LocalModelError) {
        return c.json(httpErrorBody(err.code, err.userMessage), 400);
      }
      return c.json(httpErrorBody("activate_failed", "No se pudo activar."), 400);
    }
  });
}
