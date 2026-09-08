/**
 * ResearchEngine — camino productivo MCP (PHASE 60.15).
 *
 * General Web: Electron → DuckDuckGo (sin Playwright).
 * Knowledge / Academic / Official: providers estructurados vía PaSearch.
 * QueryPlan + selección explícita; sin fallback silencioso; LLM no elige provider.
 */
import { loadResearchSearchConfig } from "./config.ts";
import {
  getSharedElectronSearchProvider,
  type ElectronDuckDuckGoSearchProvider,
} from "./providers/electron-serp.ts";
import { dedupeResults, agreementFromMerged } from "./search/dedupe.ts";
import { createPaSearchEngine, type PaSearchEngine } from "./search/engine.ts";
import { domainOf } from "./search/normalize.ts";
import {
  facetsForPlan,
  type ProviderFacet,
} from "./search/provider-selection.ts";
import { planQuery, type QueryPlan } from "./search/query-plan.ts";
import { applyDomainDiversity, rankResults } from "./search/rank.ts";
import { classifySource } from "./search/source-classifier.ts";
import type { PaSearchResult, SourceType } from "./search/types.ts";
import { PaSearchError } from "./search/types.ts";
import type {
  ResearchSourceFamily,
  SearchProvider,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "./types.ts";
import { SearchError } from "./types.ts";

export type ResearchEngineOptions = {
  /** Inyectable en tests — bypass completo del pipeline. */
  readonly search?: (request: SearchRequest) => Promise<SearchResponse>;
  readonly timeoutMs?: number;
  /** @deprecated PHASE 60.12 — Electron es el General Web; se ignora. */
  readonly electronSerpEnabled?: boolean;
  /** Provider Electron inyectable (tests / benchmarks). */
  readonly electronProvider?: ElectronDuckDuckGoSearchProvider | SearchProvider;
  readonly idleTimeoutMs?: number;
  /**
   * Providers estructurados (Wikipedia, OpenAlex, …). Default true.
   * Tests unitarios de Electron-only pueden desactivarlo.
   */
  readonly enableStructuredProviders?: boolean;
  /** PaSearch inyectable (tests). */
  readonly paEngine?: PaSearchEngine;
};

export type ResearchEngine = {
  status(): Promise<"RESEARCH_READY" | "RESEARCH_UNAVAILABLE">;
  search(request: SearchRequest): Promise<SearchResponse>;
  health(): Promise<{
    available: boolean;
    baseUrl?: string;
    detail?: string;
    provider?: string;
  }>;
  shutdown(): Promise<void>;
};

const ELECTRON_FACETS: ReadonlySet<ProviderFacet> = new Set([
  "general",
  "technical",
  "news",
  "financial",
]);

function logResearch(event: string, fields: Record<string, unknown>): void {
  try {
    process.stderr.write(
      `${JSON.stringify({ stage: "RESEARCH", event, ...fields })}\n`,
    );
  } catch {
    /* ignore */
  }
}

export function sourceFamilyForProvider(provider: string): ResearchSourceFamily {
  switch (provider) {
    case "wikipedia":
    case "duckduckgo-ia":
      return "knowledge";
    case "openalex":
    case "crossref":
    case "arxiv":
      return "academic";
    case "mx-official":
      return "official";
    default:
      return "web";
  }
}

/** General Web vía Electron cuando el plan pide facetas de descubrimiento abierto. */
export function shouldUseElectronForPlan(plan: QueryPlan): boolean {
  if (plan.intent === "research" || plan.intent === "local") return true;
  const facets = facetsForPlan(plan);
  return facets.some((f) => ELECTRON_FACETS.has(f));
}

function toPaFromElectron(res: SearchResponse): PaSearchResult[] {
  return res.results.map((r, i) => {
    const domain = r.domain || domainOf(r.url) || "unknown";
    return {
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      domain,
      sourceType: classifySource(r.url, r.title),
      publishedAt: r.publishedAt,
      retrievedAt: res.retrievedAt,
      provider: "electron-duckduckgo",
      providerPosition: i + 1,
      providerHits: [{ provider: "electron-duckduckgo", position: i + 1 }],
      agreementCount: 1,
    };
  });
}

/** Familia UX: provider estructurado gana; si no, tipificar por URL/sourceType. */
export function sourceFamilyFromPaResult(
  r: Pick<PaSearchResult, "provider" | "sourceType" | "domain" | "url">,
): ResearchSourceFamily {
  const fromProvider = sourceFamilyForProvider(r.provider);
  if (fromProvider !== "web") return fromProvider;
  const host = (r.domain || domainOf(r.url) || "").toLowerCase();
  if (host.includes("wikipedia.") || host.includes("wikidata.")) {
    return "knowledge";
  }
  if (
    host.includes("arxiv.") ||
    host.includes("openalex.") ||
    host.includes("crossref.")
  ) {
    return "academic";
  }
  return sourceFamilyFromSourceType(r.sourceType);
}

function sourceFamilyFromSourceType(
  sourceType: SourceType,
): ResearchSourceFamily {
  switch (sourceType) {
    case "academic":
      return "academic";
    case "government":
    case "university":
    case "official":
    case "documentation":
      return "official";
    default:
      return "web";
  }
}

function toSearchResults(rows: readonly PaSearchResult[]): SearchResult[] {
  return rows.map((r, i) => ({
    title: r.title,
    url: r.url,
    ...(r.snippet ? { snippet: r.snippet } : {}),
    domain: r.domain,
    ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}),
    sourceFamily: sourceFamilyFromPaResult(r),
    position: i + 1,
    ...(r.agreementCount !== undefined
      ? { agreementCount: r.agreementCount }
      : {}),
  }));
}

function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(limit)));
}

export function createResearchEngine(
  options: ResearchEngineOptions = {},
): ResearchEngine {
  const config = loadResearchSearchConfig();
  const enableStructured = options.enableStructuredProviders !== false;
  let electronProvider: SearchProvider | undefined = options.electronProvider;
  let paEngine: PaSearchEngine | undefined = options.paEngine;

  function resolveElectron(): SearchProvider {
    if (electronProvider) return electronProvider;
    electronProvider = getSharedElectronSearchProvider({
      searchTimeoutMs: options.timeoutMs ?? config.timeoutMs,
      idleTimeoutMs: options.idleTimeoutMs ?? config.electronSerpIdleTimeoutMs,
    });
    return electronProvider;
  }

  function resolvePa(): PaSearchEngine {
    if (paEngine) return paEngine;
    paEngine = createPaSearchEngine({
      enableProviderSelection: true,
      globalTimeoutMs: Math.min(
        options.timeoutMs ?? config.timeoutMs ?? 15_000,
        12_000,
      ),
    });
    return paEngine;
  }

  return {
    async status() {
      return "RESEARCH_READY";
    },

    async health() {
      return {
        available: true,
        provider: "web",
        detail: enableStructured
          ? "electron-duckduckgo+structured"
          : "electron-duckduckgo",
      };
    },

    async shutdown() {
      if (
        electronProvider &&
        "close" in electronProvider &&
        typeof (electronProvider as ElectronDuckDuckGoSearchProvider).close ===
          "function"
      ) {
        await (electronProvider as ElectronDuckDuckGoSearchProvider).close();
      }
    },

    async search(request) {
      if (options.search) {
        return options.search(request);
      }

      const limit = clampLimit(request.limit);
      const plan = planQuery({
        query: request.query,
        language: request.language,
        region: request.region,
        limit,
        signal: request.signal,
      });
      const planned: SearchRequest = {
        ...request,
        query: plan.query,
        language: plan.language,
        limit,
        ...(plan.region ? { region: plan.region } : {}),
      };

      const useElectron = shouldUseElectronForPlan(plan);
      const useStructured = enableStructured;

      if (!useElectron && !useStructured) {
        throw new SearchError(
          "provider_unavailable",
          "Ningún provider de investigación disponible",
          { provider: "web" },
        );
      }

      const bags: PaSearchResult[][] = [];
      const failures: Array<{ branch: string; code: string }> = [];
      const started = Date.now();

      const tasks: Array<Promise<void>> = [];

      if (useElectron) {
        tasks.push(
          (async () => {
            try {
              const res = await resolveElectron().search(planned);
              if (res.results.length === 0) {
                failures.push({ branch: "electron-duckduckgo", code: "empty" });
                return;
              }
              bags.push(toPaFromElectron(res));
            } catch (err) {
              const code =
                err instanceof SearchError ? err.code : "provider_unavailable";
              failures.push({ branch: "electron-duckduckgo", code });
              logResearch("branch_failed", {
                branch: "electron-duckduckgo",
                errorCode: code,
              });
            }
          })(),
        );
      }

      if (useStructured) {
        tasks.push(
          (async () => {
            try {
              const res = await resolvePa().search({
                query: planned.query,
                limit,
                language: planned.language,
                region: planned.region,
                intent: plan.intent,
                freshness: plan.freshness,
                signal: request.signal,
              });
              if (res.results.length === 0) {
                failures.push({ branch: "structured", code: "empty" });
                return;
              }
              bags.push(
                res.results.map((r) => ({
                  ...r,
                  providerHits: r.providerHits ?? [
                    {
                      provider: r.provider,
                      position: r.providerPosition ?? 99,
                    },
                  ],
                  agreementCount: r.agreementCount ?? 1,
                })),
              );
              if (res.partialFailures?.length) {
                for (const pf of res.partialFailures) {
                  failures.push({
                    branch: pf.provider,
                    code: pf.code,
                  });
                }
              }
            } catch (err) {
              const code =
                err instanceof PaSearchError
                  ? err.code
                  : "provider_unavailable";
              failures.push({ branch: "structured", code });
              logResearch("branch_failed", {
                branch: "structured",
                errorCode: code,
              });
            }
          })(),
        );
      }

      await Promise.all(tasks);

      const flat = bags.flat();
      if (flat.length === 0) {
        const codes = failures.map((f) => f.code);
        const allEmpty =
          codes.length > 0 && codes.every((c) => c === "empty");
        logResearch("search_failed", {
          intent: plan.intent,
          useElectron,
          useStructured,
          failures,
        });
        throw new SearchError(
          allEmpty ? "provider_unavailable" : "provider_unavailable",
          allEmpty
            ? "Ningún provider devolvió resultados"
            : "Investigación web no disponible",
          { provider: "web" },
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
      const sliced = diversified.slice(0, limit);
      const providers = [...new Set(sliced.map((r) => r.provider))];

      logResearch("search", {
        intent: plan.intent,
        useElectron,
        useStructured,
        providers,
        resultCount: sliced.length,
        elapsedMs: Date.now() - started,
        partialFailures: failures.length,
      });

      return {
        query: plan.query,
        provider: "web",
        results: toSearchResults(sliced),
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}

let defaultEngine: ResearchEngine | undefined;

export function getDefaultResearchEngine(): ResearchEngine {
  if (!defaultEngine) defaultEngine = createResearchEngine();
  return defaultEngine;
}

export function setDefaultResearchEngineForTests(
  engine: ResearchEngine | undefined,
): void {
  defaultEngine = engine;
}

/** @deprecated alias — Electron ya es el General Web default. */
export function createElectronEnabledResearchEngine(
  electronProvider: SearchProvider,
  options: Omit<ResearchEngineOptions, "electronProvider"> = {},
): ResearchEngine {
  return createResearchEngine({
    ...options,
    electronProvider,
  });
}
