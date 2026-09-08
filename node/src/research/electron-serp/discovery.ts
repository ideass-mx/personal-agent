/**
 * Fan-out mínimo multi-adapter (tests / discovery). Sin scraping HTTP.
 */
import { createHash } from "node:crypto";
import { urlDedupeKey } from "../search/normalize.ts";
import type { SerpAdapter, SerpHit, SerpSearchQuery } from "./shared/contract.ts";
import { hitToSearchFields } from "./shared/hits.ts";

function queryHash(q: string): string {
  return createHash("sha256").update(q, "utf8").digest("hex").slice(0, 16);
}

export type DiscoveryResult = {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly domain: string;
  readonly position: number;
  readonly providerId: string;
  readonly extractionScore: number;
};

/** Alias histórico */
export type SerpDiscoveryResult = DiscoveryResult;

function extractionScore(hit: {
  title: string;
  url: string;
  snippet?: string;
}): number {
  let s = 0;
  if (hit.title.trim().length >= 8) s += 0.35;
  else if (hit.title.trim().length >= 3) s += 0.15;
  try {
    const u = new URL(hit.url);
    if (u.protocol === "http:" || u.protocol === "https:") s += 0.35;
    if (u.pathname.length > 1 || u.search.length > 0) s += 0.1;
  } catch {
    return 0;
  }
  if ((hit.snippet ?? "").trim().length >= 20) s += 0.2;
  else if ((hit.snippet ?? "").trim().length >= 8) s += 0.1;
  if (s < 0.15) return 0;
  if (s < 0.4) return 0.25;
  if (s < 0.65) return 0.5;
  if (s < 0.85) return 0.75;
  return 1;
}

export function serpHitToDiscoveryResult(
  hit: SerpHit,
  providerId: string,
): DiscoveryResult | null {
  const fields = hitToSearchFields(hit);
  if (!fields) return null;
  return {
    ...fields,
    position: hit.position,
    providerId,
    extractionScore: extractionScore(fields),
  };
}

/** @deprecated alias */
export const scrapeHitToDiscoveryResult = serpHitToDiscoveryResult;

export function createSerpDiscoveryProvider(options: {
  readonly adapters: readonly SerpAdapter[];
  readonly sourceIds?: readonly string[];
}) {
  const byId = new Map(options.adapters.map((a) => [a.id, a]));

  return {
    async discoverFrom(
      sourceId: string,
      query: SerpSearchQuery,
    ): Promise<{
      results: DiscoveryResult[];
      health: string;
      blocked: boolean;
      providers: Array<{
        id: string;
        health: string;
        blocked: boolean;
        resultCount: number;
      }>;
    }> {
      const adapter = byId.get(sourceId);
      if (!adapter) {
        return {
          results: [],
          health: "BROKEN",
          blocked: false,
          providers: [
            { id: sourceId, health: "BROKEN", blocked: false, resultCount: 0 },
          ],
        };
      }
      const out = await adapter.search(query);
      const results: DiscoveryResult[] = [];
      const seen = new Set<string>();
      for (const hit of out.hits) {
        const disc = serpHitToDiscoveryResult(hit, adapter.id);
        if (!disc) continue;
        const key = urlDedupeKey(disc.url) ?? disc.url;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(disc);
      }
      return {
        results,
        health: out.health,
        blocked: out.blocked,
        providers: [
          {
            id: adapter.id,
            health: out.health,
            blocked: out.blocked,
            resultCount: results.length,
          },
        ],
      };
    },

    async discover(query: SerpSearchQuery) {
      const ids = options.sourceIds ?? options.adapters.map((a) => a.id);
      const started = Date.now();
      const results: DiscoveryResult[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const part = await this.discoverFrom(id, query);
        for (const r of part.results) {
          const key = urlDedupeKey(r.url) ?? r.url;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push(r);
        }
      }
      return {
        queryHash: queryHash(query.query),
        queryLength: query.query.length,
        results,
        elapsedMs: Date.now() - started,
      };
    },
  };
}
