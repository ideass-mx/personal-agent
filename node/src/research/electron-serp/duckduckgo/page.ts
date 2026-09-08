/**
 * Perfil DuckDuckGo — solo denylist / challenge / URLs.
 * Extracción = shared (DOM links genéricos).
 */
import type { ElectronSerpSiteProfile } from "../shared/site-profile.ts";
import {
  analyzeSerpPage,
  detectChallenge,
  filterOrganicHits,
  organicResultsDetected,
} from "../shared/organic.ts";
import { FILL_AND_SUBMIT_EXPRESSION } from "../shared/fill-submit.ts";
import {
  EXTRACT_LINKS_EXPRESSION,
  type PageExtract,
} from "../shared/page-extract.ts";

export const ELECTRON_DDG_PROVIDER_ID = "electron-duckduckgo";

export { EXTRACT_LINKS_EXPRESSION, FILL_AND_SUBMIT_EXPRESSION };
export type { PageExtract };

export const DDG_SITE_PROFILE: ElectronSerpSiteProfile = {
  providerId: ELECTRON_DDG_PROVIDER_ID,
  name: "Electron DuckDuckGo SERP",
  endpoint: "https://duckduckgo.com/",
  accessNotes:
    "Electron BrowserWindow show:false — primary General Web Discovery (PHASE 60.12); DOM link extract",
  serpUrlTest: /duckduckgo\.com/i,
  challengeBodyHint:
    "Please complete the following challenge to continue. Bots use DuckDuckGo too.",
  organicBodyHint: "organic serp",
  organic: {
    shellHosts: [
      "apps.apple.com",
      "play.google.com",
      "duck.ai",
      "duckduckgo.com",
      "duck.com",
      "insideduckduckgo.substack.com",
      "reddit.com",
    ],
    rejectHref: (u) =>
      /\/y\.js|uddg=/i.test(u.href) && u.hostname.includes("duckduckgo"),
    // Dedupe por URL completa (comportamiento histórico DDG).
    dedupeKey: (u) => u.toString(),
  },
  challenge: {
    extraPatterns: [/bots use duckduckgo/, /\/assets\/anomaly\//],
    captchaAllowIf: /result__a|web-result|postgresql\.org/,
  },
  buildRequestUrl: (query) =>
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  fallbackPageUrl: (query) =>
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  runSearch: (runtime, query) => runtime.searchDuckDuckGo(query, 1),
};

/** API estable para labs / browser-comparison. */
export function detectChallengeDdg(input: {
  url?: string | null;
  title?: string | null;
  bodyText?: string | null;
}): boolean {
  return detectChallenge(input, DDG_SITE_PROFILE.challenge);
}

export { detectChallengeDdg as detectChallenge };

export function filterOrganicHitsDdg(
  links: readonly { href: string; text: string }[],
  limit = 10,
) {
  return filterOrganicHits(links, limit, DDG_SITE_PROFILE.organic);
}

export { filterOrganicHitsDdg as filterOrganicHits };

export { organicResultsDetected };

export function analyzeSerpPageDdg(extract: PageExtract) {
  return analyzeSerpPage(extract, {
    organic: DDG_SITE_PROFILE.organic,
    challenge: DDG_SITE_PROFILE.challenge,
  });
}

export { analyzeSerpPageDdg as analyzeSerpPage };
