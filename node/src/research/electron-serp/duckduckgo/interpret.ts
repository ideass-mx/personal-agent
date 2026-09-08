/**
 * DuckDuckGo — interpretación vía perfil genérico.
 */
import type { BlockDetection } from "../shared/contract.ts";
import {
  classifyElectronSerpHealth,
  detectBlockForProfile,
  interpretSerpExtractForProfile,
  queryHash16,
  validateAndDedupeHits,
  type ElectronSearchEngineOutcome,
} from "../shared/interpret.ts";
import {
  pageExtractFromHtml as pageExtractFromHtmlShared,
  type PageExtract,
} from "../shared/page-extract.ts";
import { DDG_SITE_PROFILE, ELECTRON_DDG_PROVIDER_ID } from "./page.ts";

export {
  ELECTRON_DDG_PROVIDER_ID,
  classifyElectronSerpHealth,
  queryHash16,
  validateAndDedupeHits,
  type ElectronSearchEngineOutcome,
};

export function detectElectronBlock(html: string, status = 200): BlockDetection {
  return detectBlockForProfile(DDG_SITE_PROFILE, html, status);
}

export function interpretSerpExtract(input: {
  extract: PageExtract;
  limit: number;
  html?: string;
  broken?: boolean;
}): ElectronSearchEngineOutcome {
  return interpretSerpExtractForProfile(DDG_SITE_PROFILE, input);
}

export function pageExtractFromHtml(
  html: string,
  url = "https://duckduckgo.com/",
): PageExtract {
  return pageExtractFromHtmlShared(html, url);
}
