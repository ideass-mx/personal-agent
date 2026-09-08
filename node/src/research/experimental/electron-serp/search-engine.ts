export {
  ELECTRON_DDG_PROVIDER_ID,
  queryHash16,
  validateAndDedupeHits,
  classifyElectronSerpHealth,
  detectElectronBlock,
  interpretSerpExtract,
  pageExtractFromHtml,
  type ElectronSearchEngineOutcome,
} from "../../electron-serp/duckduckgo/interpret.ts";
export { parseLinksFromHtml } from "../../electron-serp/shared/page-extract.ts";
