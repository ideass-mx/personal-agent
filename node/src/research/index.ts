/**
 * research — capa de búsqueda web local (contrato + adapters).
 * Aún no registrada como Agent Extension / MCP tool.
 */
import type { SearchProviderId } from "./types.ts";

export type {
  ResearchSourceFamily,
  SearchErrorCode,
  SearchProvider,
  SearchProviderId,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "./types.ts";
export {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_TIMEOUT_MS,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_REDIRECTS,
  MAX_SEARCH_RESPONSE_BYTES,
  SearchError,
} from "./types.ts";
export {
  AGENT_SEARCH_ENGINES_ENV,
  DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS,
  ELECTRON_SERP_ENABLED_ENV,
  ELECTRON_SERP_IDLE_TIMEOUT_MS_ENV,
  LIBREY_BASE_URL_ENV,
  SEARCH_PROVIDER_ENV,
  SEARCH_TIMEOUT_MS_ENV,
  WEBSURFX_BASE_URL_ENV,
  isLocalHttpSearchProvider,
  loadResearchSearchConfig,
  parseBoolEnv,
  parseSearchProviderId,
  requireProviderBaseUrl,
  type ResearchSearchConfig,
} from "./config.ts";
export {
  createSearchRouter,
  researchSearch,
  type SearchRouter,
  type SearchRouterOptions,
} from "./router.ts";
export { createWebsurfxProvider } from "./providers/websurfx.ts";
export { createLibreyProvider } from "./providers/librey.ts";
export {
  ELECTRON_SERP_PROVIDER_ID,
  createElectronDuckDuckGoSearchProvider,
  getSharedElectronSearchProvider,
  shutdownElectronSerp,
  resetSharedElectronSearchProviderForTests,
  type ElectronDuckDuckGoSearchProvider,
  type ElectronSearchProviderOptions,
  type ElectronSerpRuntimeState,
} from "./providers/electron-serp.ts";
export {
  AGENT_SEARCH_MCP_ID,
  DEFAULT_AGENT_SEARCH_ENGINES,
  createAgentSearchMcpProvider,
  type AgentSearchDiagnostics,
  type AgentSearchEngineFailure,
  type AgentSearchFn,
  type AgentSearchMcpProviderOptions,
} from "./providers/agent-search-mcp.ts";
export {
  createResearchEngine,
  createElectronEnabledResearchEngine,
  getDefaultResearchEngine,
  setDefaultResearchEngineForTests,
  shouldUseElectronForPlan,
  sourceFamilyForProvider,
  sourceFamilyFromPaResult,
  type ResearchEngine,
  type ResearchEngineOptions,
} from "./engine.ts";
export { searchHttpGetJson } from "./http.ts";
export {
  assertUrlSafeForResearchFetch,
  isBlockedHostname,
  isBlockedIpAddress,
} from "./ssrf.ts";
export {
  extractReadableTextFromHtml,
  looksLikeHtml,
} from "./html-extract.ts";
export {
  DEFAULT_FETCH_MAX_BYTES,
  DEFAULT_FETCH_MAX_REDIRECTS,
  DEFAULT_FETCH_MAX_TEXT_CHARS,
  DEFAULT_FETCH_TIMEOUT_MS,
  researchFetch,
  type ResearchFetchFailure,
  type ResearchFetchRequest,
  type ResearchFetchResult,
  type ResearchFetchSuccess,
} from "./fetch.ts";
export {
  DEFAULT_RESEARCH_BUDGET_LIMITS,
  createResearchBudgetStore,
  defaultResearchBudgetStore,
  type ResearchBudgetLimits,
  type ResearchBudgetSnapshot,
  type ResearchBudgetStore,
} from "./budget.ts";

/** Consultas fijas del harness de comparación (PHASE Web Intelligence + 60.1-A). */
export const BENCHMARK_QUERIES = [
  "doctorados inteligencia artificial México beca 2026",
  "Ed25519 Android API 29",
  "últimas noticias OpenAI",
  "PostgreSQL 17 novedades",
  "mejores laptops RTX para inteligencia artificial 2026",
  "OpenAI latest news September 2026",
  "Anthropic Claude latest model 2026",
  "Windows 11 BitLocker virtual machine cloning",
  "mejores ETFs para invertir 2026",
  "SECIHTI doctorado inteligencia artificial 2026",
  "Universidad Autónoma de Querétaro inteligencia artificial doctorado",
] as const;

export const ALL_PROVIDERS: readonly SearchProviderId[] = [
  "websurfx",
  "librey",
  "agent-search-mcp",
  "electron-duckduckgo",
];

/** PHASE 60.6 — motor experimental (no producción MCP). */
export {
  PERSONAL_AGENT_SEARCH_ID,
  createPaSearchEngine,
  createPersonalAgentSearchProvider,
  createWikipediaProvider,
  createArxivProvider,
  createDuckDuckGoProvider,
  parseDuckDuckGoHtml,
  dedupeResults,
  rankResults,
  classifySource,
  canonicalizeUrl,
  planQuery,
  PaSearchError,
} from "./search/index.ts";
