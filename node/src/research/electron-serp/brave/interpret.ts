/**
 * Brave — interpretación vía perfil genérico.
 */
import type { BlockDetection } from "../shared/contract.ts";
import {
  classifyElectronSerpHealth,
  detectBlockForProfile,
  interpretSerpExtractForProfile,
  validateAndDedupeHits,
  type ElectronSearchEngineOutcome,
} from "../shared/interpret.ts";
import {
  pageExtractFromHtml,
  type PageExtract,
} from "../shared/page-extract.ts";
import { BRAVE_SITE_PROFILE, ELECTRON_BRAVE_PROVIDER_ID } from "./page.ts";

export {
  ELECTRON_BRAVE_PROVIDER_ID,
  classifyElectronSerpHealth,
  validateAndDedupeHits,
};

export function detectBraveBlock(html: string, status = 200): BlockDetection {
  return detectBlockForProfile(BRAVE_SITE_PROFILE, html, status);
}

export function interpretBraveSerpExtract(input: {
  extract: PageExtract;
  limit: number;
  html?: string;
  broken?: boolean;
}): ElectronSearchEngineOutcome {
  return interpretSerpExtractForProfile(BRAVE_SITE_PROFILE, input);
}

export function pageExtractFromBraveHtml(
  html: string,
  url = "https://search.brave.com/search?q=test",
): PageExtract {
  return pageExtractFromHtml(html, url);
}
