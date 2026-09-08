/**
 * Electron SERP — DuckDuckGo (prod) + Brave (experimental).
 * Autosuficiente: sin carpeta scraping.
 */
export * from "./types.ts";
export * from "./diagnostics.ts";
export * from "./runtime.ts";
export * from "./session.ts";
export * from "./discovery.ts";

export type * from "./shared/contract.ts";
export {
  EXTRACT_LINKS_EXPRESSION,
  parseLinksFromHtml,
  pageExtractFromHtml,
  type PageExtract,
} from "./shared/page-extract.ts";
export { FILL_AND_SUBMIT_EXPRESSION } from "./shared/fill-submit.ts";
export {
  detectChallenge as detectChallengeGeneric,
  filterOrganicHits as filterOrganicHitsGeneric,
  organicResultsDetected,
  analyzeSerpPage as analyzeSerpPageGeneric,
} from "./shared/organic.ts";
export type {
  ElectronSerpSiteProfile,
  SiteOrganicOptions,
  SiteChallengeOptions,
  OrganicHit,
  ChallengeInput,
} from "./shared/site-profile.ts";
export {
  queryHash16,
  validateAndDedupeHits,
  classifyElectronSerpHealth,
  detectBlockFromChallenge,
  detectBlockForProfile,
  interpretSerpExtractForProfile,
  interpretSerpExtractForSite,
  type ElectronSearchEngineOutcome,
} from "./shared/interpret.ts";
export { toSerpHit, meanConfidence, hitToSearchFields } from "./shared/hits.ts";
export {
  createElectronSerpAdapterFromSpec,
  type ElectronSerpAdapterExtras,
  type ElectronSerpAdapterOptions,
  type ElectronSerpSessionMode,
  type ElectronSerpSearchFn,
  type ElectronSerpEngineSpec,
} from "./shared/adapter-base.ts";

export {
  ELECTRON_DDG_PROVIDER_ID,
  DDG_SITE_PROFILE,
  detectChallenge,
  filterOrganicHits,
  analyzeSerpPage,
  FILL_AND_SUBMIT_EXPRESSION as DDG_FILL_AND_SUBMIT_EXPRESSION,
} from "./duckduckgo/page.ts";
export {
  detectElectronBlock,
  interpretSerpExtract,
  pageExtractFromHtml as pageExtractFromDdgHtml,
} from "./duckduckgo/interpret.ts";
export {
  createElectronDuckDuckGoSerpAdapter,
  createElectronSerpProvider,
  type ElectronDuckDuckGoSerpAdapter,
  type ElectronSerpProviderOptions,
} from "./duckduckgo/adapter.ts";

export {
  ELECTRON_BRAVE_PROVIDER_ID,
  BRAVE_SITE_PROFILE,
  detectBraveChallenge,
  filterBraveOrganicHits,
  analyzeBraveSerpPage,
  BRAVE_FILL_AND_SUBMIT_EXPRESSION,
  BRAVE_EXTRACT_LINKS_EXPRESSION,
  type BravePageExtract,
} from "./brave/page.ts";
export {
  detectBraveBlock,
  interpretBraveSerpExtract,
  pageExtractFromBraveHtml,
} from "./brave/interpret.ts";
export {
  createElectronBraveSerpAdapter,
  type ElectronBraveSerpAdapter,
  type ElectronBraveSerpProviderOptions,
} from "./brave/adapter.ts";
