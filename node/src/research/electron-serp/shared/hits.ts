/**
 * Hits SERP desde título/url (sin recipes).
 */
import { stripTags } from "../../search/normalize.ts";
import type { SerpHit } from "./contract.ts";

function looksLikeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function toSerpHit(input: {
  title: string;
  url: string;
  snippet?: string;
  provider: string;
  position: number;
}): SerpHit | null {
  const title = stripTags(input.title).trim();
  const url = input.url.trim();
  if (!title || !looksLikeHttpUrl(url)) return null;
  const snippet = input.snippet ? stripTags(input.snippet).trim() : undefined;
  const titleOk = title.length >= 8 ? 0.97 : title.length >= 3 ? 0.8 : 0.2;
  const confidence = Math.round((titleOk * 0.5 + 0.5) * 1000) / 1000;
  return {
    title,
    url,
    ...(snippet ? { snippet } : {}),
    provider: input.provider,
    position: input.position,
    confidence,
  };
}

export function meanConfidence(hits: readonly SerpHit[]): number {
  if (hits.length === 0) return 0;
  const sum = hits.reduce((a, h) => a + h.confidence, 0);
  return Math.round((sum / hits.length) * 1000) / 1000;
}

export function hitToSearchFields(hit: SerpHit): {
  title: string;
  url: string;
  snippet?: string;
  domain: string;
} | null {
  try {
    const u = new URL(hit.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const title = hit.title.trim();
    if (title.length < 3) return null;
    return {
      title: title.slice(0, 300),
      url: u.toString(),
      ...(hit.snippet ? { snippet: hit.snippet.slice(0, 500) } : {}),
      domain: u.hostname.replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}
