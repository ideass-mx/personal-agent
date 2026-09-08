/**
 * SearchProvider wrapper — Electron DuckDuckGo SERP (PHASE 60.12).
 * Provider principal de research.search. Sesión reutilizable + idle timeout.
 * Sin fallback silencioso a Mojeek / HTTP.
 */
import { createHash } from "node:crypto";
import { hitToSearchFields } from "../electron-serp/shared/hits.ts";
import {
  createElectronDuckDuckGoSerpAdapter,
  type ElectronDuckDuckGoSerpAdapter,
} from "../electron-serp/duckduckgo/adapter.ts";
import { ELECTRON_DDG_PROVIDER_ID } from "../electron-serp/duckduckgo/interpret.ts";
import {
  DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS,
  loadResearchSearchConfig,
} from "../config.ts";
import type {
  SearchProvider,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "../types.ts";
import { SearchError } from "../types.ts";

export const ELECTRON_SERP_PROVIDER_ID = ELECTRON_DDG_PROVIDER_ID;

/** Estados simples del runtime Electron (PHASE 60.12). */
export type ElectronSerpRuntimeState =
  | "COLD"
  | "STARTING"
  | "READY"
  | "BUSY"
  | "IDLE"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";

export type ElectronSearchProviderOptions = {
  readonly idleTimeoutMs?: number;
  readonly searchTimeoutMs?: number;
  readonly navigateTimeoutMs?: number;
  /** Tests: adapter inyectado (no se recrea en idle/crash). */
  readonly adapter?: ElectronDuckDuckGoSerpAdapter;
};

function queryHash16(q: string): string {
  return createHash("sha256").update(q, "utf8").digest("hex").slice(0, 16);
}

function logResearch(event: string, fields: Record<string, unknown>): void {
  try {
    process.stderr.write(
      `${JSON.stringify({ stage: "RESEARCH", event, ...fields })}\n`,
    );
  } catch {
    /* ignore */
  }
}

export type ElectronDuckDuckGoSearchProvider = SearchProvider & {
  close(): Promise<void>;
  /** true si el proceso Electron está caliente. */
  isWarm(): boolean;
  getRuntimeState(): ElectronSerpRuntimeState;
};

/**
 * Provider SearchProvider id=`electron-duckduckgo`.
 * Posee la sesión Electron (reusable + idle timeout + crash recovery).
 */
export function createElectronDuckDuckGoSearchProvider(
  options: ElectronSearchProviderOptions = {},
): ElectronDuckDuckGoSearchProvider {
  const cfg = loadResearchSearchConfig();
  const idleTimeoutMs =
    options.idleTimeoutMs ??
    cfg.electronSerpIdleTimeoutMs ??
    DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS;
  const ownsAdapter = !options.adapter;
  const searchTimeoutMs = options.searchTimeoutMs ?? cfg.timeoutMs ?? 45_000;
  const navigateTimeoutMs = options.navigateTimeoutMs ?? 45_000;

  function makeAdapter(): ElectronDuckDuckGoSerpAdapter {
    return createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchTimeoutMs,
      navigateTimeoutMs,
    });
  }

  let adapter: ElectronDuckDuckGoSerpAdapter =
    options.adapter ?? makeAdapter();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let warm = false;
  let closed = false;
  let state: ElectronSerpRuntimeState = "COLD";
  /** Cola serial concurrency=1 a nivel provider (además de la del adapter). */
  let queue: Promise<unknown> = Promise.resolve();

  function clearIdle(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  async function stopRuntime(reason: string): Promise<void> {
    clearIdle();
    state = "STOPPING";
    logResearch("electron_serp_stopping", {
      providerId: ELECTRON_SERP_PROVIDER_ID,
      reason,
    });
    try {
      await adapter.close();
    } catch {
      /* ignore */
    }
    if (ownsAdapter) {
      adapter = makeAdapter();
    }
    warm = false;
    state = "STOPPED";
    logResearch("electron_serp_stopped", {
      providerId: ELECTRON_SERP_PROVIDER_ID,
      reason,
    });
  }

  function scheduleIdle(): void {
    clearIdle();
    if (idleTimeoutMs <= 0 || closed) return;
    state = "IDLE";
    idleTimer = setTimeout(() => {
      void stopRuntime("idle_timeout");
    }, idleTimeoutMs);
  }

  async function ensureWarm(): Promise<{ launchLatencyMs: number; reused: boolean }> {
    if (closed) {
      throw new SearchError("provider_unavailable", "Electron SERP cerrado", {
        provider: ELECTRON_SERP_PROVIDER_ID,
      });
    }
    if (warm) {
      return { launchLatencyMs: 0, reused: true };
    }
    state = "STARTING";
    const t0 = Date.now();
    try {
      await adapter.warmUp();
      warm = true;
      state = "READY";
      const launchLatencyMs = Date.now() - t0;
      logResearch("electron_serp_launch", {
        providerId: ELECTRON_SERP_PROVIDER_ID,
        launchLatencyMs,
        runtimeReuse: false,
      });
      return { launchLatencyMs, reused: false };
    } catch (err) {
      state = "FAILED";
      warm = false;
      if (ownsAdapter) {
        try {
          await adapter.close();
        } catch {
          /* ignore */
        }
        adapter = makeAdapter();
      }
      throw err;
    }
  }

  function enqueueSearch<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const provider: ElectronDuckDuckGoSearchProvider = {
    id: "electron-duckduckgo",
    isWarm: () => warm,
    getRuntimeState: () => state,
    async close() {
      closed = true;
      clearIdle();
      state = "STOPPING";
      try {
        await adapter.close();
      } catch {
        /* ignore */
      }
      warm = false;
      state = "STOPPED";
    },
    async search(request: SearchRequest): Promise<SearchResponse> {
      return enqueueSearch(async () => {
        if (request.signal?.aborted) {
          throw new SearchError("aborted", "Búsqueda cancelada", {
            provider: ELECTRON_SERP_PROVIDER_ID,
          });
        }

        const started = Date.now();
        const qh = queryHash16(request.query);
        let launchLatencyMs = 0;

        try {
          const warmInfo = await ensureWarm();
          launchLatencyMs = warmInfo.launchLatencyMs;
          if (warmInfo.reused) {
            logResearch("electron_serp_reuse", {
              providerId: ELECTRON_SERP_PROVIDER_ID,
              runtimeReuse: true,
            });
          }
          clearIdle();
          state = "BUSY";

          const out = await adapter.search({
            query: request.query,
            limit: request.limit,
            language: request.language,
            region: request.region,
            signal: request.signal,
          });

          if (request.signal?.aborted) {
            state = warm ? "READY" : "COLD";
            throw new SearchError("aborted", "Búsqueda cancelada", {
              provider: ELECTRON_SERP_PROVIDER_ID,
            });
          }

          if (out.blocked || out.health === "BLOCKED") {
            logResearch("electron_serp_search", {
              providerId: ELECTRON_SERP_PROVIDER_ID,
              queryHash: qh,
              health: "BLOCKED",
              blocked: true,
              resultCount: 0,
              latencyMs: Date.now() - started,
              launchLatencyMs,
            });
            scheduleIdle();
            throw new SearchError(
              "provider_unavailable",
              "Investigación web no disponible (acceso bloqueado).",
              { provider: ELECTRON_SERP_PROVIDER_ID },
            );
          }

          if (out.health === "BROKEN" || out.fingerprint === "timeout") {
            const code =
              out.fingerprint === "timeout" ? "timeout" : "provider_unavailable";
            logResearch("electron_serp_search", {
              providerId: ELECTRON_SERP_PROVIDER_ID,
              queryHash: qh,
              health: out.health,
              blocked: false,
              resultCount: 0,
              latencyMs: Date.now() - started,
              launchLatencyMs,
            });
            // Posible crash parcial — enfriar para recrear en la siguiente
            if (out.fingerprint === "error") {
              state = "FAILED";
              await stopRuntime("search_broken");
            } else {
              scheduleIdle();
            }
            throw new SearchError(
              code,
              code === "timeout"
                ? "Tiempo de espera agotado en búsqueda web."
                : "Investigación web no disponible.",
              { provider: ELECTRON_SERP_PROVIDER_ID },
            );
          }

          const results: SearchResult[] = [];
          for (const hit of out.hits) {
            const fields = hitToSearchFields(hit);
            if (!fields) continue;
            results.push(fields);
          }

          logResearch("electron_serp_search", {
            providerId: ELECTRON_SERP_PROVIDER_ID,
            queryHash: qh,
            health: out.health,
            blocked: false,
            resultCount: results.length,
            latencyMs: Date.now() - started,
            launchLatencyMs,
            runtimeReuse: warmInfo.reused,
          });

          scheduleIdle();

          return {
            query: request.query,
            provider: ELECTRON_SERP_PROVIDER_ID,
            results,
            retrievedAt: new Date().toISOString(),
          };
        } catch (err) {
          if (err instanceof SearchError) {
            if (state === "BUSY") scheduleIdle();
            throw err;
          }
          // Crash / unexpected — no tumbar Node; recrear runtime
          logResearch("electron_serp_search_failed", {
            providerId: ELECTRON_SERP_PROVIDER_ID,
            queryHash: qh,
            errorCode: "provider_unavailable",
            latencyMs: Date.now() - started,
            launchLatencyMs,
          });
          state = "FAILED";
          await stopRuntime("crash");
          throw new SearchError(
            "provider_unavailable",
            "Investigación web no disponible.",
            {
              provider: ELECTRON_SERP_PROVIDER_ID,
              cause: err,
            },
          );
        }
      });
    },
  };

  return provider;
}

/** Singleton de proceso para research.search MCP. */
let shared: ElectronDuckDuckGoSearchProvider | undefined;

export function getSharedElectronSearchProvider(
  options?: ElectronSearchProviderOptions,
): ElectronDuckDuckGoSearchProvider {
  if (!shared) shared = createElectronDuckDuckGoSearchProvider(options);
  return shared;
}

export async function shutdownElectronSerp(): Promise<void> {
  if (!shared) return;
  const s = shared;
  shared = undefined;
  await s.close().catch(() => undefined);
}

/** Solo tests. */
export function resetSharedElectronSearchProviderForTests(): void {
  shared = undefined;
}
