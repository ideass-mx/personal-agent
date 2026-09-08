/**
 * Deduplicación + merge de metadata (PHASE 60.6.3).
 * Referencia conceptual: agrupación por URL en metasearch — implementación propia.
 */
import { urlDedupeKey } from "./normalize.ts";
import type { PaSearchResult, ProviderHit } from "./types.ts";

function pickLonger(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function mergeTwo(a: PaSearchResult, b: PaSearchResult): PaSearchResult {
  const hits: ProviderHit[] = [
    ...(a.providerHits ?? [
      {
        provider: a.provider,
        position: a.providerPosition ?? 99,
      },
    ]),
    ...(b.providerHits ?? [
      {
        provider: b.provider,
        position: b.providerPosition ?? 99,
      },
    ]),
  ];
  // Unique by provider (keep best/lowest position)
  const byProv = new Map<string, ProviderHit>();
  for (const h of hits) {
    const prev = byProv.get(h.provider);
    if (!prev || h.position < prev.position) byProv.set(h.provider, h);
  }
  const providerHits = [...byProv.values()].sort(
    (x, y) => x.position - y.position || x.provider.localeCompare(y.provider),
  );
  const bestPos = Math.min(...providerHits.map((h) => h.position));
  const primary =
    providerHits[0]?.provider ??
    ((a.providerHits?.length ?? 0) >= (b.providerHits?.length ?? 0)
      ? a.provider
      : b.provider);


  return {
    title: pickLonger(a.title, b.title) ?? a.title,
    url: a.url,
    snippet: pickLonger(a.snippet, b.snippet),
    domain: a.domain || b.domain,
    sourceType: a.sourceType !== "other" ? a.sourceType : b.sourceType,
    retrievedAt: a.retrievedAt <= b.retrievedAt ? a.retrievedAt : b.retrievedAt,
    provider: primary,
    providerPosition: bestPos,
    providerHits,
    agreementCount: providerHits.length,
    publishedAt: a.publishedAt ?? b.publishedAt,
    relevanceScore: a.relevanceScore,
    qualityScore: a.qualityScore,
  };
}

export function dedupeResults(results: readonly PaSearchResult[]): {
  results: PaSearchResult[];
  duplicateCount: number;
} {
  const map = new Map<string, PaSearchResult>();
  let duplicateCount = 0;
  for (const r of results) {
    const key = urlDedupeKey(r.url) ?? r.url;
    const existing = map.get(key);
    if (!existing) {
      const seed: PaSearchResult = {
        ...r,
        providerHits: r.providerHits ?? [
          { provider: r.provider, position: r.providerPosition ?? 99 },
        ],
        agreementCount: r.agreementCount ?? 1,
      };
      map.set(key, seed);
      continue;
    }
    duplicateCount += 1;
    map.set(key, mergeTwo(existing, r));
  }
  return { results: [...map.values()], duplicateCount };
}

/** Mapa url → agreement count tras merge. */
export function agreementFromMerged(
  results: readonly PaSearchResult[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of results) {
    out.set(r.url, r.agreementCount ?? r.providerHits?.length ?? 1);
  }
  return out;
}

/** Mapa url → hits con posición. */
export function hitsFromMerged(
  results: readonly PaSearchResult[],
): Map<string, readonly ProviderHit[]> {
  const out = new Map<string, readonly ProviderHit[]>();
  for (const r of results) {
    out.set(
      r.url,
      r.providerHits ?? [
        { provider: r.provider, position: r.providerPosition ?? 99 },
      ],
    );
  }
  return out;
}
