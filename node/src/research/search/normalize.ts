/**
 * Normalización de URLs/títulos/snippets del Search Engine.
 */
import { classifySource } from "./source-classifier.ts";
import type { PaSearchResult } from "./types.ts";
import { DEFAULT_PA_LIMIT, MAX_PA_LIMIT, PaSearchError } from "./types.ts";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export function clampPaLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PA_LIMIT;
  const n = Math.trunc(limit);
  if (n < 1) return 1;
  if (n > MAX_PA_LIMIT) return MAX_PA_LIMIT;
  return n;
}

export function requirePaQuery(query: unknown): string {
  if (typeof query !== "string") {
    throw new PaSearchError("invalid_input", "query debe ser string");
  }
  const q = query.trim();
  if (!q) throw new PaSearchError("invalid_input", "query vacía");
  if (q.length > 500) throw new PaSearchError("invalid_input", "query demasiado larga");
  return q;
}

export function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    const keys = [...u.searchParams.keys()];
    for (const k of keys) {
      if (TRACKING_PARAMS.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    // Host lower-case; drop default ports
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "http:" && u.port === "80") ||
      (u.protocol === "https:" && u.port === "443")
    ) {
      u.port = "";
    }
    // Trailing slash soft-normalize for root paths only
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Clave de dedupe: http/https + www/non-www unificados.
 * No muta la URL mostrada al usuario (solo comparación).
 */
export function urlDedupeKey(raw: string): string | null {
  const canonical = canonicalizeUrl(raw);
  if (!canonical) return null;
  try {
    const u = new URL(canonical);
    u.protocol = "https:";
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return u.toString();
  } catch {
    return canonical;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function buildPaResult(input: {
  title: string;
  url: string;
  snippet?: string;
  provider: string;
  publishedAt?: string;
  retrievedAt?: string;
}): PaSearchResult | null {
  const url = canonicalizeUrl(input.url);
  if (!url) return null;
  const title = stripTags(input.title).slice(0, 300);
  if (!title) return null;
  const domain = domainOf(url);
  if (!domain) return null;
  const snippet = input.snippet
    ? stripTags(input.snippet).slice(0, 500)
    : undefined;
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  return {
    title,
    url,
    ...(snippet ? { snippet } : {}),
    domain,
    sourceType: classifySource(url, title),
    retrievedAt,
    provider: input.provider,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
  };
}

/** Relevancia léxica simple 0..1 (tokens de query en título/snippet/url). */
export function lexicalRelevance(query: string, r: PaSearchResult): number {
  const tokens = query
    .toLowerCase()
    .replace(/[¿?¡!,.;:()\[\]"]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return 0.5;
  const hay = `${r.title} ${r.snippet ?? ""} ${r.url}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  return Math.min(1, hits / tokens.length);
}
