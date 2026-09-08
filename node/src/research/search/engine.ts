/**
 * Personal Agent Search Engine — fan-out paralelo, plan, select, normalize, dedupe, rank.
 * Experimental (PHASE 60.6 / 60.6.1 / 60.6.2). Sin fallback de producto.
 */
import { dedupeResults, agreementFromMerged } from "./dedupe.ts";
import { requirePaQuery, clampPaLimit } from "./normalize.ts";
import { createArxivProvider } from "./providers/arxiv.ts";
import { createCrossrefProvider } from "./providers/crossref.ts";
import { createDuckDuckGoProvider } from "./providers/duckduckgo.ts";
import { createDuckDuckGoInstantAnswerProvider } from "./providers/duckduckgo-ia.ts";
import { createHackerNewsProvider } from "./providers/hackernews.ts";
import { createMojeekProvider } from "./providers/mojeek.ts";
import { createMxOfficialProvider } from "./providers/mx-official.ts";
import { createOpenAlexProvider } from "./providers/openalex.ts";
import { createWikipediaProvider } from "./providers/wikipedia.ts";
import {
  selectProvidersForPlan,
  stripUnsupportedRequestFlags,
} from "./provider-selection.ts";
import { planQuery } from "./query-plan.ts";
import { applyDomainDiversity, rankResults } from "./rank.ts";
import type {
  PaSearchProvider,
  PaSearchProviderId,
  PaSearchRequest,
  PaSearchResponse,
  PaSearchResult,
  ProviderConfig,
  ProviderReport,
  ProviderStatus,
} from "./types.ts";
import {
  DEFAULT_GLOBAL_TIMEOUT_MS,
  DEFAULT_PROVIDER_CONFIGS,
  PaSearchError,
} from "./types.ts";

export type PaSearchEngineOptions = {
  readonly providers?: readonly PaSearchProvider[];
  /** @deprecated prefer providerConfigs */
  readonly providerTimeoutMs?: number;
  readonly globalTimeoutMs?: number;
  readonly enabled?: readonly PaSearchProviderId[];
  readonly providerConfigs?: Partial<
    Record<PaSearchProviderId, Partial<ProviderConfig>>
  >;
  /** Si false, ejecuta todos los providers disponibles (medir). Default true. */
  readonly enableProviderSelection?: boolean;
};

function mergeConfigs(
  overrides?: Partial<Record<PaSearchProviderId, Partial<ProviderConfig>>>,
  legacyTimeout?: number,
): Record<PaSearchProviderId, ProviderConfig> {
  const out = { ...DEFAULT_PROVIDER_CONFIGS } as Record<
    PaSearchProviderId,
    ProviderConfig
  >;
  for (const id of Object.keys(out) as PaSearchProviderId[]) {
    const base = out[id];
    const o = overrides?.[id];
    out[id] = {
      timeoutMs: o?.timeoutMs ?? legacyTimeout ?? base.timeoutMs,
      maxResults: o?.maxResults ?? base.maxResults,
      enabled: o?.enabled ?? base.enabled,
      maxRetries: o?.maxRetries ?? base.maxRetries,
    };
  }
  return out;
}

function defaultProviders(
  configs: Record<PaSearchProviderId, ProviderConfig>,
): PaSearchProvider[] {
  return [
    createDuckDuckGoInstantAnswerProvider({
      timeoutMs: configs["duckduckgo-ia"].timeoutMs,
    }),
    createHackerNewsProvider({ timeoutMs: configs.hackernews.timeoutMs }),
    createMxOfficialProvider(),
    createWikipediaProvider(),
    createArxivProvider(),
    createOpenAlexProvider(),
    createCrossrefProvider(),
    // HTML scrapers: solo si enabled explícitamente en config
    createDuckDuckGoProvider({
      timeoutMs: configs.duckduckgo.timeoutMs,
      maxRetries: configs.duckduckgo.maxRetries ?? 1,
    }),
    createMojeekProvider({
      timeoutMs: configs.mojeek.timeoutMs,
      maxRetries: configs.mojeek.maxRetries ?? 1,
    }),
  ];
}

function pickProviders(
  all: readonly PaSearchProvider[],
  enabled?: readonly PaSearchProviderId[],
  configs?: Record<PaSearchProviderId, ProviderConfig>,
): PaSearchProvider[] {
  let list = [...all];
  if (enabled && enabled.length > 0) {
    const set = new Set(enabled);
    list = list.filter((p) => set.has(p.id));
  }
  if (configs) {
    list = list.filter((p) => configs[p.id]?.enabled !== false);
  }
  return list;
}

function mapErrorToStatus(err: unknown): ProviderStatus {
  if (!(err instanceof PaSearchError)) return "http_error";
  switch (err.code) {
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate_limited";
    case "parse_error":
    case "invalid_response":
      return "parse_error";
    case "aborted":
      return "aborted";
    case "unavailable":
      return "unavailable";
    case "http_error":
      return "http_error";
    default:
      return "unavailable";
  }
}

/** Anota posición 1-based en la lista del provider (evidencia para ranking). */
function annotateProviderPositions(
  rows: readonly PaSearchResult[],
): PaSearchResult[] {
  return rows.map((r, i) => ({
    ...r,
    providerPosition: i + 1,
    providerHits: [{ provider: r.provider, position: i + 1 }],
    agreementCount: 1,
  }));
}

export type PaSearchEngine = {
  search(request: PaSearchRequest): Promise<PaSearchResponse>;
};

export function createPaSearchEngine(
  options: PaSearchEngineOptions = {},
): PaSearchEngine {
  const configs = mergeConfigs(options.providerConfigs, options.providerTimeoutMs);
  const catalog = pickProviders(
    options.providers ?? defaultProviders(configs),
    options.enabled,
    options.providers ? undefined : configs,
  );
  const globalTimeoutMs = options.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;
  const enableSelection = options.enableProviderSelection !== false;

  return {
    async search(request) {
      const rawQuery = requirePaQuery(request.query);
      const plan = planQuery({ ...request, query: rawQuery });
      const limit = clampPaLimit(request.limit);
      const started = Date.now();

      const catalogIds = catalog.map((p) => p.id);
      const selectedIds = enableSelection
        ? selectProvidersForPlan(plan, catalogIds)
        : catalogIds;
      const selectedSet = new Set(selectedIds);
      const providers = catalog.filter((p) => selectedSet.has(p.id));

      const globalCtrl = new AbortController();
      const globalTimer = setTimeout(() => globalCtrl.abort(), globalTimeoutMs);
      const onOuter = () => globalCtrl.abort();
      request.signal?.addEventListener("abort", onOuter, { once: true });

      const providerReports: ProviderReport[] = [];
      const partialFailures: PaSearchResponse["partialFailures"] = [];
      const bags: PaSearchResult[][] = [];

      // Providers del catálogo no seleccionados → unavailable (explícito, no oculto)
      for (const p of catalog) {
        if (!selectedSet.has(p.id)) {
          providerReports.push({
            provider: p.id,
            status: "unavailable",
            resultCount: 0,
            elapsedMs: 0,
          });
        }
      }

      try {
        await Promise.all(
          providers.map(async (provider) => {
            const cfg = configs[provider.id] ?? {
              timeoutMs: 5_000,
              maxResults: limit,
              enabled: true,
            };
            const providerCtrl = new AbortController();
            const pTimer = setTimeout(
              () => providerCtrl.abort(),
              cfg.timeoutMs,
            );
            const onGlobal = () => providerCtrl.abort();
            globalCtrl.signal.addEventListener("abort", onGlobal, {
              once: true,
            });
            const pStarted = Date.now();
            try {
              const safeFlags = stripUnsupportedRequestFlags(selectedIds, {
                safeSearch: request.safeSearch,
              });
              const rows = await provider.search({
                ...request,
                ...safeFlags,
                query: plan.query,
                limit: Math.min(limit, cfg.maxResults),
                language: plan.language,
                // Solo propagar region si el provider declara soporte — vía plan;
                // providers sin soporte la ignoran; ranking compensa.
                region: plan.region ?? request.region,
                intent: plan.intent,
                freshness: plan.freshness,
                signal: providerCtrl.signal,
              });
              bags.push(annotateProviderPositions(rows));
              const status: ProviderStatus =
                rows.length === 0 ? "empty" : "success";
              providerReports.push({
                provider: provider.id,
                status,
                resultCount: rows.length,
                elapsedMs: Date.now() - pStarted,
              });
              if (status === "empty") {
                partialFailures.push({
                  provider: provider.id,
                  code: "empty",
                });
              }
            } catch (err) {
              let status = mapErrorToStatus(err);
              const elapsed = Date.now() - pStarted;
              if (
                status === "aborted" &&
                !request.signal?.aborted &&
                elapsed >= cfg.timeoutMs - 75
              ) {
                status = "timeout";
              }
              const code =
                status === "timeout"
                  ? "timeout"
                  : err instanceof PaSearchError
                    ? err.code
                    : "http_error";
              providerReports.push({
                provider: provider.id,
                status,
                resultCount: 0,
                elapsedMs: elapsed,
              });
              partialFailures.push({ provider: provider.id, code });
            } finally {
              clearTimeout(pTimer);
              globalCtrl.signal.removeEventListener("abort", onGlobal);
            }
          }),
        );
      } finally {
        clearTimeout(globalTimer);
        request.signal?.removeEventListener("abort", onOuter);
      }

      const flat = bags.flat();
      if (flat.length === 0) {
        throw new PaSearchError(
          "all_providers_failed",
          "Ningún provider de búsqueda devolvió resultados",
        );
      }

      const { results: deduped } = dedupeResults(flat);
      const agreementByUrl = agreementFromMerged(deduped);
      const ranked = rankResults(plan.query, deduped, {
        plan,
        agreementByUrl,
        request: {
          intent: plan.intent,
          language: plan.language,
          region: plan.region,
          freshness: plan.freshness,
        },
      });
      const diversified = applyDomainDiversity(ranked, {
        maxPerDomain: 2,
        softMaxPerDomain: 3,
        window: Math.max(limit, 10),
      });
      return {
        query: plan.query,
        results: diversified.slice(0, limit),
        providers: [...new Set(flat.map((r) => r.provider))],
        elapsedMs: Date.now() - started,
        partialFailures,
        providerReports,
        plan: {
          intent: plan.intent,
          language: plan.language,
          ...(plan.region ? { region: plan.region } : {}),
          categories: [...plan.categories],
          selectedProviders: selectedIds,
          intentInferred: plan.intentInferred,
        },
      };
    },
  };
}
