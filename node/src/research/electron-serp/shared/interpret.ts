/**
 * Pipeline de interpretación SERP Electron (genérico).
 * Links DOM/HTML → filtro por perfil → hits.
 */
import { createHash } from "node:crypto";
import { urlDedupeKey } from "../../search/normalize.ts";
import { detectAccessSignal } from "./access.ts";
import type {
  BlockDetection,
  SerpHealth,
  SerpHit,
  SerpSearchOutcome,
} from "./contract.ts";
import { pageFingerprint } from "./fingerprint.ts";
import { meanConfidence, toSerpHit } from "./hits.ts";
import {
  analyzeSerpPage,
  detectChallenge,
  filterOrganicHits,
} from "./organic.ts";
import {
  parseLinksFromHtml,
  type PageExtract,
} from "./page-extract.ts";
import type { ElectronSerpSiteProfile } from "./site-profile.ts";

export function queryHash16(q: string): string {
  return createHash("sha256").update(q, "utf8").digest("hex").slice(0, 16);
}

export function validateAndDedupeHits(
  hits: readonly SerpHit[],
  limit: number,
): SerpHit[] {
  const seen = new Set<string>();
  const out: SerpHit[] = [];
  for (const h of hits) {
    if (!h.title.trim()) continue;
    let url: string;
    try {
      const u = new URL(h.url);
      const proto = u.protocol.toLowerCase();
      if (proto !== "http:" && proto !== "https:") continue;
      url = u.toString();
    } catch {
      continue;
    }
    const key = urlDedupeKey(url) ?? url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...h, url, position: out.length + 1 });
    if (out.length >= limit) break;
  }
  return out;
}

export function classifyElectronSerpHealth(input: {
  broken: boolean;
  challenge: boolean;
  hitCount: number;
  unexpected: boolean;
}): SerpHealth {
  if (input.broken) return "BROKEN";
  if (input.challenge) return "BLOCKED";
  if (input.hitCount >= 5) return "HEALTHY";
  if (input.hitCount >= 1) return "DEGRADED";
  if (input.unexpected) return "UNKNOWN";
  return "UNKNOWN";
}

/** @deprecated alias */
export type ElectronSearchEngineOutcome = SerpSearchOutcome;

export function detectBlockFromChallenge(
  html: string,
  status: number,
  isChallenge: boolean,
): BlockDetection {
  if (!isChallenge) return { blocked: false };
  const access = detectAccessSignal(html, status);
  return {
    blocked: true,
    reason:
      access === "http_403"
        ? "http_403"
        : access === "http_429"
          ? "http_429"
          : access === "http_challenge"
            ? "http_challenge"
            : "captcha",
  };
}

function hitsFromOrganic(
  providerId: string,
  organic: Array<{ title: string; url: string; domain: string }>,
): SerpHit[] {
  const hits: SerpHit[] = [];
  for (const o of organic) {
    const hit = toSerpHit({
      title: o.title,
      url: o.url,
      provider: providerId,
      position: hits.length + 1,
    });
    if (hit) hits.push(hit);
  }
  return hits;
}

export function interpretSerpExtractForProfile(
  profile: ElectronSerpSiteProfile,
  input: {
    extract: PageExtract;
    limit: number;
    html?: string;
    broken?: boolean;
  },
): SerpSearchOutcome {
  const analysis = analyzeSerpPage(input.extract, {
    organic: profile.organic,
    challenge: profile.challenge,
    limit: Math.max(input.limit, 12),
  });
  const broken = input.broken === true;
  const challenge = analysis.challenge;
  const unexpected =
    !challenge &&
    !broken &&
    analysis.hits.length === 0 &&
    !profile.serpUrlTest.test(input.extract.url) &&
    input.extract.title.length > 0;

  if (challenge) {
    const html = input.html ?? input.extract.bodyText;
    return {
      hits: [],
      health: "BLOCKED",
      blocked: true,
      recovered: false,
      fingerprint: pageFingerprint(html),
      meanConfidence: 0,
      html: input.html,
      pageTitle: analysis.pageTitle,
      finalUrl: analysis.finalUrl,
      latencyMs: 0,
    };
  }

  if (broken) {
    return {
      hits: [],
      health: "BROKEN",
      blocked: false,
      recovered: false,
      fingerprint: "broken",
      meanConfidence: 0,
      html: input.html,
      pageTitle: analysis.pageTitle,
      finalUrl: analysis.finalUrl,
      latencyMs: 0,
    };
  }

  let hits = hitsFromOrganic(
    profile.providerId,
    analysis.hits.slice(0, input.limit),
  );

  if (hits.length === 0 && input.html) {
    hits = hitsFromOrganic(
      profile.providerId,
      filterOrganicHits(
        parseLinksFromHtml(input.html),
        input.limit,
        profile.organic,
      ),
    );
  }

  hits = validateAndDedupeHits(hits, input.limit);
  const recovered = hits.length > 0;
  const health = classifyElectronSerpHealth({
    broken: false,
    challenge: false,
    hitCount: hits.length,
    unexpected,
  });

  return {
    hits,
    health,
    blocked: false,
    recovered,
    fingerprint: pageFingerprint(
      input.html ?? input.extract.bodyText,
    ),
    meanConfidence: meanConfidence(hits),
    html: input.html,
    pageTitle: analysis.pageTitle,
    finalUrl: analysis.finalUrl,
    latencyMs: 0,
  };
}

export function detectBlockForProfile(
  profile: ElectronSerpSiteProfile,
  html: string,
  status = 200,
): BlockDetection {
  return detectBlockFromChallenge(
    html,
    status,
    detectChallenge({ bodyText: html, title: "", url: "" }, profile.challenge),
  );
}

export const interpretSerpExtractForSite = interpretSerpExtractForProfile;
