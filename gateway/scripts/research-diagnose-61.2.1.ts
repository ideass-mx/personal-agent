/**
 * Diagnóstico live PHASE 61.2.1 — runtime local sin Web.
 *
 * Uso:
 *   npm run research:diagnose:61.2.1 --prefix gateway
 *
 * Opt-in live (requiere runtime+modelo instalados):
 *   PERSONAL_AGENT_LOCAL_LLM_LIVE=1 npm run research:diagnose:61.2.1 --prefix gateway
 *
 * No deja procesos huérfanos. No aumenta timeouts. No cambia el modelo.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyRuntimeFailure,
  createLocalModelManager,
  createLocalRuntimeManager,
  createManagedLlamaServerRuntimeWithManager,
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  formatTraceConsole,
  getLocalLlmHealthTimeoutMs,
  getLocalModelVariant,
  resolveProductDataRoot,
  resolveRuntimeManifest,
} from "../src/local-llm/index.ts";
import { sha256File } from "../src/local-llm/validator.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outJson = path.join(
  repoRoot,
  "research/phase-61.2.1-runtime-health-timeout.json",
);

const LOOKUP_ID = process.env.PERSONAL_AGENT_DIAGNOSTIC_ID?.trim() || "PA-64B2B87C3FE8";
const LIVE = process.env.PERSONAL_AGENT_LOCAL_LLM_LIVE === "1";

type Artifact = Record<string, unknown>;

function countLlamaServerProcesses(): number {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        'tasklist /FI "IMAGENAME eq llama-server.exe" /NH',
        { encoding: "utf8" },
      );
      return out.split(/\r?\n/).filter((l) => /llama-server/i.test(l)).length;
    }
    const out = execSync("ps -eo args=", { encoding: "utf8" });
    return out
      .split(/\n/)
      .filter((l) => /llama-server/.test(l) && !/diagnose|tsx|node/.test(l))
      .length;
  } catch {
    return -1;
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const beforeCount = countLlamaServerProcesses();
  const manifest = resolveRuntimeManifest();
  const dataRoot = resolveProductDataRoot();
  const modelManager = createLocalModelManager();
  const active = modelManager.getActive();
  const variant = getLocalModelVariant(
    DEFAULT_LOCAL_MODEL_ID,
    DEFAULT_LOCAL_VARIANT_ID,
  );
  const artifact: Artifact = {
    phase: "61.2.1",
    startedAt,
    lookupDiagnosticId: LOOKUP_ID,
    historicalLookup: {
      diagnosticId: LOOKUP_ID,
      found: false,
      note:
        "Sin eventos runtime_starting/process_spawned en SQLite local de este host; el id original fue reportado en cliente (posible Windows).",
    },
    environment: {
      os: process.platform,
      arch: process.arch,
      node: process.version,
      dataRoot,
      live: LIVE,
    },
    health: {
      endpoint: "GET http://127.0.0.1:{port}/health",
      perAttemptTimeoutMs: 2000,
      pollIntervalMs: 400,
      success: "res.ok (HTTP 2xx)",
      configuredTimeoutMs: getLocalLlmHealthTimeoutMs(),
      envOverride: process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS ?? null,
    },
    expectedArgs: [
      "-m",
      "<modelPath>",
      "--host",
      "127.0.0.1",
      "--port",
      "<ephemeral>",
      "--ctx-size",
      "4096",
      "-np",
      "1",
    ],
    runtime: {
      manifest: manifest
        ? {
            runtimeId: manifest.runtimeId,
            version: manifest.version,
            platform: manifest.platform,
            architecture: manifest.architecture,
            binaryName: manifest.binaryName,
          }
        : null,
    },
    model: {
      id: DEFAULT_LOCAL_MODEL_ID,
      active: active
        ? { modelId: active.modelId, variantId: active.variantId, path: active.path }
        : null,
      catalogVariant: variant
        ? {
            id: variant.id,
            quantization: variant.quantization,
            expectedBytes: variant.expectedBytes,
            sha256: variant.sha256,
          }
        : null,
    },
    processCounts: { before: beforeCount, during: null, after: null },
    timeline: [] as unknown[],
    classification: null,
    inference: null,
    conclusion: null as string | null,
  };

  // Intento de lookup histórico (best-effort; puede fallar sin DB).
  try {
    const { createSqliteDiagnosticsStore } = await import(
      "../src/diagnostics/store.ts"
    );
    const store = createSqliteDiagnosticsStore();
    const events = store.byDiagnosticId(LOOKUP_ID);
    artifact.historicalLookup = {
      diagnosticId: LOOKUP_ID,
      found: events.length > 0,
      eventCount: events.length,
      events: events.map((e) => ({
        at: e.timestamp,
        event: e.event,
        stage: e.stage,
        component: e.component,
        errorCode: e.errorCode,
        durationMs: e.durationMs,
        metadata: e.metadata,
      })),
      note:
        events.length === 0
          ? "No hay bitácora local para este diagnosticId en este host."
          : "Eventos encontrados en SQLite local.",
    };
  } catch (err) {
    artifact.historicalLookup = {
      diagnosticId: LOOKUP_ID,
      found: false,
      note: `Lookup no disponible: ${err instanceof Error ? err.message : "error"}`,
    };
  }

  if (!LIVE) {
    artifact.conclusion =
      "LIVE no habilitado (PERSONAL_AGENT_LOCAL_LLM_LIVE≠1). Instrumentación y artefactos listos; reproducción real pendiente en el host con modelo/runtime.";
    writeOutputs(artifact, null);
    console.log(JSON.stringify({ ok: true, live: false, outJson }, null, 2));
    console.log(
      "\nPara diagnóstico live: PERSONAL_AGENT_LOCAL_LLM_LIVE=1 npm run research:diagnose:61.2.1 --prefix gateway\n",
    );
    return;
  }

  if (!manifest) {
    artifact.conclusion = "CAUSE_NOT_IDENTIFIED: sin RuntimeManifest para esta plataforma.";
    writeOutputs(artifact, null);
    process.exitCode = 2;
    return;
  }
  if (!active?.path || !fs.existsSync(active.path)) {
    artifact.conclusion =
      "MODEL_NOT_FOUND: no hay modelo activo instalado (distinto de RUNTIME_HEALTH_TIMEOUT).";
    writeOutputs(artifact, null);
    process.exitCode = 2;
    return;
  }

  // Checksum opcional (puede tardar ~segundos en ~2.3GiB).
  let checksumOk: boolean | null = null;
  if (variant && process.env.PERSONAL_AGENT_LOCAL_LLM_SKIP_HASH !== "1") {
    try {
      const digest = await sha256File(active.path);
      checksumOk = digest.toLowerCase() === variant.sha256.toLowerCase();
      (artifact.model as Record<string, unknown>).checksumOk = checksumOk;
      (artifact.model as Record<string, unknown>).sizeBytes = fs.statSync(
        active.path,
      ).size;
    } catch (err) {
      (artifact.model as Record<string, unknown>).checksumError =
        err instanceof Error ? err.message : "checksum_failed";
    }
  }

  const diagEvents: unknown[] = [];
  const manager = createLocalRuntimeManager({
    diagnostics: {
      record: (input) => {
        diagEvents.push({
          event: input.event,
          diagnosticId: input.diagnosticId,
          errorCode: input.errorCode,
          durationMs: input.durationMs,
          metadata: input.metadata,
        });
      },
    },
  });

  const diagnosticId = `PA-6121${Date.now().toString(16).slice(-8).toUpperCase()}`;
  let duringCount = beforeCount;
  try {
    if (!manager.isInstalled()) {
      artifact.conclusion =
        "RUNTIME_NOT_INSTALLED: binario llama-server ausente (distinto de health timeout).";
      writeOutputs(artifact, null);
      process.exitCode = 2;
      return;
    }

    await manager.ensureReady(active.path, {
      diagnosticId,
      executionId: diagnosticId,
    });
    duringCount = countLlamaServerProcesses();
    (artifact.processCounts as Record<string, unknown>).during = duringCount;

    const trace = manager.getLastStartupTrace();
    if (trace) {
      artifact.timeline = trace.events;
      artifact.classification = classifyRuntimeFailure(trace);
      artifact.runtime = {
        ...(artifact.runtime as object),
        binaryPath: trace.binaryPath,
        binaryExists: trace.binaryExists,
        pid: trace.childPid,
        port: trace.port,
        args: trace.args,
        readyAtMs: trace.readyAtMs,
        stdoutSummary: trace.stdoutSummary,
        stderrSummary: trace.stderrSummary,
      };
      console.log(formatTraceConsole(trace));
    }

    // Inferencia mínima si READY
    const { runtime } = createManagedLlamaServerRuntimeWithManager(manager);
    const tInf0 = Date.now();
    let firstTokenMs: number | null = null;
    let text = "";
    try {
      for await (const ev of runtime.generate({
        messages: [{ role: "user", content: "Say hello." }],
        maxTokens: 32,
      })) {
        if (ev.type === "text_delta") {
          if (firstTokenMs === null) firstTokenMs = Date.now() - tInf0;
          text += ev.text;
        }
      }
      artifact.inference = {
        ok: true,
        firstTokenMs,
        completedMs: Date.now() - tInf0,
        chars: text.length,
      };
      artifact.conclusion =
        "No runtime failure detected in live diagnostic. Compare readyAtMs vs health timeout; if prior PA-64B2B87C3FE8 failed, re-run on the same Windows host with this instrumentation.";
    } catch (err) {
      artifact.inference = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        firstTokenMs,
      };
      artifact.conclusion =
        "Health/runtime reached READY but minimal inference failed (caso H candidato).";
    } finally {
      await runtime.shutdown();
    }
  } catch (err) {
    const trace = manager.getLastStartupTrace();
    if (trace) {
      artifact.timeline = trace.events;
      artifact.classification = classifyRuntimeFailure(trace);
      artifact.runtime = {
        ...(artifact.runtime as object),
        binaryPath: trace.binaryPath,
        pid: trace.childPid,
        port: trace.port,
        args: trace.args,
        exitCode: trace.exitCode,
        aliveAtTimeout: trace.processAliveAtTimeout,
        stdoutSummary: trace.stdoutSummary,
        stderrSummary: trace.stderrSummary,
        errorCode: trace.errorCode,
        failedAtMs: trace.failedAtMs,
      };
      console.log(formatTraceConsole(trace));
      const cls = classifyRuntimeFailure(trace);
      artifact.conclusion = cls.rootCause
        ? `ROOT_CAUSE: ${cls.rootCause} (${cls.case})`
        : `CAUSE_NOT_IDENTIFIED (${cls.case})`;
    } else {
      artifact.conclusion = `CAUSE_NOT_IDENTIFIED: ${err instanceof Error ? err.message : String(err)}`;
    }
    process.exitCode = 1;
  } finally {
    try {
      await manager.stop();
    } catch {
      /* ignore */
    }
    (artifact.processCounts as Record<string, unknown>).after =
      countLlamaServerProcesses();
    (artifact as Artifact).diagnosticEvents = diagEvents;
    (artifact as Artifact).endedAt = new Date().toISOString();
    writeOutputs(artifact, manager.getLastStartupTrace());
  }
}

function writeOutputs(
  artifact: Artifact,
  trace: ReturnType<
    ReturnType<typeof createLocalRuntimeManager>["getLastStartupTrace"]
  >,
): void {
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  // Informe canónico: docs/architecture/phase-61.2.1-runtime-health-timeout.md
  // Aquí solo un resumen de la última corrida live.
  if (!(artifact.environment as { live?: boolean })?.live && !trace) {
    return;
  }

  const cls = trace ? classifyRuntimeFailure(trace) : null;
  const runMd = path.join(
    repoRoot,
    "research/phase-61.2.1-runtime-health-timeout-last-run.md",
  );
  const md = `# PHASE 61.2.1 — Última corrida live

Ver análisis canónico en \`docs/architecture/phase-61.2.1-runtime-health-timeout.md\`.

## Conclusion

\`\`\`text
${(artifact.conclusion as string) || "CAUSE_NOT_IDENTIFIED"}
\`\`\`

## Classification

\`\`\`text
${cls ? `${cls.case}\n${cls.rootCause ?? "CAUSE_NOT_IDENTIFIED"}\nconfidence=${cls.confidence}` : "sin trace"}
\`\`\`

## Artifact

\`research/phase-61.2.1-runtime-health-timeout.json\`
`;
  fs.writeFileSync(runMd, md, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
