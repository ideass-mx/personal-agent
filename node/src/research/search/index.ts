/**
 * Personal Agent Search Engine (PHASE 60.6.x) — experimental.
 */
export type {
  PaSearchEngine,
  PaSearchEngineOptions,
} from "./engine.ts";
export { createPaSearchEngine } from "./engine.ts";
export {
  PERSONAL_AGENT_SEARCH_ID,
  createPersonalAgentSearchProvider,
} from "./adapter.ts";
export type {
  PaSearchProvider,
  PaSearchProviderId,
  PaSearchRequest,
  PaSearchResponse,
  PaSearchResult,
  ProviderConfig,
  ProviderHit,
  ProviderReport,
  ProviderStatus,
  SearchFreshness,
  SearchIntent,
  SourceType,
} from "./types.ts";
export {
  DEFAULT_GLOBAL_TIMEOUT_MS,
  DEFAULT_PA_LIMIT,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_PA_LIMIT,
  PaSearchError,
} from "./types.ts";
export {
  agreementFromMerged,
  dedupeResults,
  hitsFromMerged,
} from "./dedupe.ts";
export {
  agreementPositionSignal,
  applyDomainDiversity,
  freshnessScore,
  positionScore,
  rankResults,
} from "./rank.ts";
export type { QueryPlan, SearchCategory } from "./query-plan.ts";
export { inferIntent, normalizeQueryText, planQuery } from "./query-plan.ts";
export type {
  ProviderCapabilities,
  ProviderCapability,
  ProviderFacet,
} from "./provider-selection.ts";
export {
  PROVIDER_CAPABILITIES,
  anySupportsSafeSearch,
  facetsForPlan,
  getProviderCapabilities,
  providerConfidence,
  scoreProviderForPlan,
  selectProvidersForPlan,
  stripUnsupportedRequestFlags,
} from "./provider-selection.ts";
export {
  buildPaResult,
  canonicalizeUrl,
  clampPaLimit,
  lexicalRelevance,
  requirePaQuery,
  urlDedupeKey,
} from "./normalize.ts";
export type { SourceRule } from "./source-classifier.ts";
export {
  DEFAULT_SOURCE_RULES,
  classifySource,
  domainQualityScore,
  matchSourceRule,
  sourceQualityScore,
} from "./source-classifier.ts";
export { createWikipediaProvider } from "./providers/wikipedia.ts";
export { createArxivProvider } from "./providers/arxiv.ts";
export { createOpenAlexProvider } from "./providers/openalex.ts";
export { createCrossrefProvider } from "./providers/crossref.ts";
export {
  createDuckDuckGoProvider,
  detectDuckDuckGoBlock,
  parseDuckDuckGoHtml,
} from "./providers/duckduckgo.ts";
export {
  createDuckDuckGoInstantAnswerProvider,
  parseDuckDuckGoInstantAnswer,
} from "./providers/duckduckgo-ia.ts";
export {
  createHackerNewsProvider,
  parseHackerNewsHits,
} from "./providers/hackernews.ts";
export {
  createMxOfficialProvider,
  matchMxOfficialCatalog,
  MX_OFFICIAL_CATALOG,
} from "./providers/mx-official.ts";
export {
  createMojeekProvider,
  detectMojeekBlock,
  parseMojeekHtml,
} from "./providers/mojeek.ts";
