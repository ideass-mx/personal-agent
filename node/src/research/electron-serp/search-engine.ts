/** @deprecated Importar desde `./duckduckgo/interpret.ts` o `../electron-serp`. */
export {
  ELECTRON_DDG_PROVIDER_ID,
  queryHash16,
  validateAndDedupeHits,
  classifyElectronSerpHealth,
  detectElectronBlock,
  interpretSerpExtract,
  pageExtractFromHtml,
  type ElectronSearchEngineOutcome,
} from "./duckduckgo/interpret.ts";
export { parseLinksFromHtml } from "./shared/page-extract.ts";
