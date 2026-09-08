/**
 * Perfil Brave Search — solo denylist / challenge / URLs.
 * Extracción = shared (DOM links genéricos).
 */
import type { ElectronSerpSiteProfile } from "../shared/site-profile.ts";
import {
  analyzeSerpPage,
  detectChallenge,
  filterOrganicHits,
} from "../shared/organic.ts";
import { FILL_AND_SUBMIT_EXPRESSION } from "../shared/fill-submit.ts";
import {
  EXTRACT_LINKS_EXPRESSION,
  type PageExtract,
} from "../shared/page-extract.ts";

export const ELECTRON_BRAVE_PROVIDER_ID = "electron-brave";

export { EXTRACT_LINKS_EXPRESSION, FILL_AND_SUBMIT_EXPRESSION };
export type { PageExtract };
/** @deprecated */
export type BravePageExtract = PageExtract;

export const BRAVE_SITE_PROFILE: ElectronSerpSiteProfile = {
  providerId: ELECTRON_BRAVE_PROVIDER_ID,
  name: "Electron Brave Search Web SERP",
  endpoint: "https://search.brave.com/",
  accessNotes:
    "Experimental Electron BrowserWindow show:false — Brave Search Web; DOM link extract; no API (PHASE 60.13)",
  serpUrlTest: /search\.brave\.com/i,
  challengeBodyHint:
    "Verify you are human. Unusual traffic. Please complete the security check.",
  organicBodyHint: "organic serp",
  organic: {
    shellHosts: [
      "search.brave.com",
      "brave.com",
      "cdn.search.brave.com",
      "account.brave.com",
      "api.search.brave.com",
    ],
  },
  challenge: {},
  buildRequestUrl: (query) =>
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
  fallbackPageUrl: (query) =>
    `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  runSearch: (runtime, query) => runtime.searchBrave(query, 1),
};

export function detectBraveChallenge(input: {
  url?: string | null;
  title?: string | null;
  bodyText?: string | null;
}): boolean {
  return detectChallenge(input, BRAVE_SITE_PROFILE.challenge);
}

export function filterBraveOrganicHits(
  links: readonly { href: string; text: string }[],
  limit: number,
) {
  return filterOrganicHits(links, limit, BRAVE_SITE_PROFILE.organic);
}

export function analyzeBraveSerpPage(extract: PageExtract) {
  return analyzeSerpPage(extract, {
    organic: BRAVE_SITE_PROFILE.organic,
    challenge: BRAVE_SITE_PROFILE.challenge,
  });
}

/** @deprecated */
export const BRAVE_EXTRACT_LINKS_EXPRESSION = EXTRACT_LINKS_EXPRESSION;
/** @deprecated */
export const BRAVE_FILL_AND_SUBMIT_EXPRESSION = FILL_AND_SUBMIT_EXPRESSION;
