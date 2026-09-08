/**
 * Ranking determinista intent-aware (PHASE 60.6.1 / 60.6.2).
 * Señales: relevance, intent/source match, quality, language/region,
 * freshness, provider confidence, multi-provider agreement, soft diversity.
 * Sin LLM.
 */
import { lexicalRelevance } from "./normalize.ts";
import { providerConfidence } from "./provider-selection.ts";
import type { QueryPlan } from "./query-plan.ts";
import {
  domainQualityScore,
  sourceQualityScore,
} from "./source-classifier.ts";
import type {
  PaSearchProviderId,
  PaSearchRequest,
  PaSearchResult,
  SearchFreshness,
  SearchIntent,
  SourceType,
} from "./types.ts";

type IntentWeights = {
  readonly relevance: number;
  readonly quality: number;
  readonly freshness: number;
  readonly provider: number;
  readonly locale: number;
  readonly preference: number;
  readonly agreement: number;
  readonly position: number;
};

const INTENT_WEIGHTS: Record<SearchIntent, IntentWeights> = {
  general: {
    relevance: 0.38,
    quality: 0.14,
    freshness: 0.1,
    provider: 0.09,
    locale: 0.08,
    preference: 0.06,
    agreement: 0.08,
    position: 0.07,
  },
  research: {
    relevance: 0.28,
    quality: 0.26,
    freshness: 0.07,
    provider: 0.07,
    locale: 0.1,
    preference: 0.08,
    agreement: 0.07,
    position: 0.07,
  },
  academic: {
    relevance: 0.28,
    quality: 0.3,
    freshness: 0.05,
    provider: 0.1,
    locale: 0.04,
    preference: 0.09,
    agreement: 0.07,
    position: 0.07,
  },
  technical: {
    relevance: 0.32,
    quality: 0.24,
    freshness: 0.05,
    provider: 0.09,
    locale: 0.06,
    preference: 0.09,
    agreement: 0.08,
    position: 0.07,
  },
  news: {
    relevance: 0.26,
    quality: 0.12,
    freshness: 0.28,
    provider: 0.07,
    locale: 0.06,
    preference: 0.06,
    agreement: 0.08,
    position: 0.07,
  },
  financial: {
    relevance: 0.28,
    quality: 0.2,
    freshness: 0.22,
    provider: 0.07,
    locale: 0.06,
    preference: 0.06,
    agreement: 0.06,
    position: 0.05,
  },
  local: {
    relevance: 0.3,
    quality: 0.24,
    freshness: 0.05,
    provider: 0.07,
    locale: 0.12,
    preference: 0.08,
    agreement: 0.07,
    position: 0.07,
  },
};

export function freshnessScore(
  publishedAt: string | undefined,
  mode: SearchFreshness = "any",
): number {
  if (!publishedAt) {
    // evergreen: no castigar fuerte; news/financial: neutro-bajo
    return mode === "any" ? 0.6 : 0.42;
  }
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return mode === "any" ? 0.6 : 0.42;
  const ageDays = (Date.now() - t) / (86400 * 1000);
  if (mode === "day") {
    if (ageDays <= 1) return 1;
    if (ageDays <= 3) return 0.7;
    return 0.25;
  }
  if (mode === "week") {
    if (ageDays <= 7) return 1;
    if (ageDays <= 30) return 0.7;
    return 0.3;
  }
  if (mode === "month") {
    if (ageDays <= 30) return 0.95;
    if (ageDays <= 180) return 0.65;
    return 0.35;
  }
  if (mode === "year") {
    if (ageDays <= 365) return 0.9;
    if (ageDays <= 365 * 3) return 0.55;
    return 0.3;
  }
  // any — evergreen friendly
  if (ageDays < 30) return 0.85;
  if (ageDays < 365) return 0.7;
  if (ageDays < 365 * 5) return 0.6;
  return 0.5;
}

function languageMatchScore(
  r: PaSearchResult,
  language: string,
): number {
  const lang = language.toLowerCase();
  const host = r.domain.toLowerCase();
  const blob = `${r.title} ${r.snippet ?? ""}`.toLowerCase();
  if (lang.startsWith("es")) {
    let s = 0.5;
    if (host.endsWith(".mx") || host.includes(".es") || host.startsWith("es.")) {
      s += 0.25;
    }
    if (/[áéíóúñ¿¡]/.test(blob) || /\b(méxico|mexico|doctorado|universidad)\b/.test(blob)) {
      s += 0.15;
    }
    return Math.min(1, s);
  }
  if (lang.startsWith("en")) {
    if (host.startsWith("es.") || host.endsWith(".mx")) return 0.45;
    return 0.7;
  }
  return 0.55;
}

function regionMatchScore(
  r: PaSearchResult,
  region: string | undefined,
  preferred: readonly SourceType[],
): number {
  if (!region) return 0.55;
  const reg = region.toUpperCase();
  const host = r.domain.toLowerCase();
  if (reg === "MX") {
    let s = 0.45;
    if (host.endsWith(".gob.mx") || host.endsWith(".edu.mx") || host.endsWith(".gov.mx")) {
      s = 0.98;
    } else if (
      preferred.includes(r.sourceType) &&
      (r.sourceType === "government" ||
        r.sourceType === "university" ||
        r.sourceType === "official")
    ) {
      s = 0.9;
    } else if (host.endsWith(".mx")) {
      // .mx genérico: señal débil de región, NO de calidad institucional
      s = 0.62;
    }
    return s;
  }
  return 0.55;
}

function preferenceMatchScore(
  sourceType: SourceType,
  preferred: readonly SourceType[],
): number {
  const idx = preferred.indexOf(sourceType);
  if (idx === -1) return 0.35;
  return Math.max(0.45, 1 - idx * 0.08);
}

function agreementScore(count: number): number {
  if (count <= 1) return 0.4;
  if (count === 2) return 0.75;
  return Math.min(1, 0.75 + (count - 2) * 0.1);
}

/**
 * Position score propio (referencia conceptual Σ 1/position de metasearch).
 * Agreement no es regla absoluta: se combina con quality/relevance en el finalScore.
 */
export function positionScore(
  hits: ReadonlyArray<{ position: number }> | undefined,
  fallbackPosition?: number,
): number {
  const positions =
    hits && hits.length > 0
      ? hits.map((h) => Math.max(1, h.position))
      : [Math.max(1, fallbackPosition ?? 10)];
  const sumInv = positions.reduce((a, p) => a + 1 / p, 0);
  const avgInv = sumInv / positions.length;
  // Aparecer alto (pos 1 → 1.0) vs bajo (pos 10 → 0.1)
  return Math.min(1, Math.max(0.05, avgInv));
}

/** Combina agreement + position sin que agreement domine solo. */
export function agreementPositionSignal(
  agreementCount: number,
  hits: ReadonlyArray<{ position: number }> | undefined,
  fallbackPosition?: number,
): { agreement: number; position: number; combined: number } {
  const agreement = agreementScore(agreementCount);
  const position = positionScore(hits, fallbackPosition);
  // Un solo official excelente (agree=1, pos=1) puede superar varios mediocres
  const combined = 0.55 * agreement + 0.45 * position;
  return { agreement, position, combined };
}

export type RankContext = {
  readonly plan?: QueryPlan;
  readonly agreementByUrl?: ReadonlyMap<string, number>;
  readonly request?: Pick<
    PaSearchRequest,
    "intent" | "language" | "region" | "freshness"
  >;
};

export type RankedResult = PaSearchResult & {
  readonly relevanceScore: number;
  readonly qualityScore: number;
  readonly finalScore: number;
};

export function rankResults(
  query: string,
  results: readonly PaSearchResult[],
  requestOrCtx?:
    | Pick<PaSearchRequest, "intent" | "language" | "region" | "freshness">
    | RankContext,
): RankedResult[] {
  const ctx: RankContext =
    requestOrCtx && "plan" in (requestOrCtx as RankContext)
      ? (requestOrCtx as RankContext)
      : { request: requestOrCtx as PaSearchRequest | undefined };

  const plan = ctx.plan;
  const intent: SearchIntent =
    plan?.intent ?? ctx.request?.intent ?? "general";
  const language = plan?.language ?? ctx.request?.language ?? "en";
  const region = plan?.region ?? ctx.request?.region;
  const freshnessMode = plan?.freshness ?? ctx.request?.freshness ?? "any";
  const preferred =
    plan?.preferredSourceTypes ??
    (["official", "documentation", "other"] as SourceType[]);
  const w = INTENT_WEIGHTS[intent];

  const ranked = results.map((r) => {
    const relevanceScore = lexicalRelevance(query, r);
    const dq = domainQualityScore(r.url);
    const qualityScore = sourceQualityScore(r.sourceType, intent, dq);
    const providerSignal = providerConfidence(r.provider as PaSearchProviderId);
    const fresh = freshnessScore(r.publishedAt, freshnessMode);
    const locale =
      0.55 * languageMatchScore(r, language) +
      0.45 * regionMatchScore(r, region, preferred);
    const preference = preferenceMatchScore(r.sourceType, preferred);
    const agreeN =
      r.agreementCount ??
      ctx.agreementByUrl?.get(r.url) ??
      r.providerHits?.length ??
      1;
    const { agreement: agree, position: pos } = agreementPositionSignal(
      agreeN,
      r.providerHits,
      r.providerPosition,
    );

    // En general, demorar academic fuerte (gap 60.6.1)
    let academicPenalty = 0;
    if (
      intent === "general" &&
      (r.sourceType === "academic" || r.provider === "openalex" || r.provider === "crossref")
    ) {
      academicPenalty = 0.06;
    }

    // Official único y alto no debe perder frente a acuerdo mediocre
    let officialBoost = 0;
    if (
      (r.sourceType === "government" ||
        r.sourceType === "university" ||
        r.sourceType === "official") &&
      agreeN === 1 &&
      (r.providerPosition ?? 99) <= 3
    ) {
      officialBoost = 0.04;
    }

    const finalScore =
      w.relevance * relevanceScore +
      w.quality * qualityScore +
      w.provider * providerSignal +
      w.freshness * fresh +
      w.locale * locale +
      w.preference * preference +
      w.agreement * agree +
      w.position * pos +
      officialBoost -
      academicPenalty;

    return {
      ...r,
      relevanceScore: Number(relevanceScore.toFixed(4)),
      qualityScore: Number(qualityScore.toFixed(4)),
      finalScore: Number(finalScore.toFixed(4)),
    };
  });
  ranked.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.url.localeCompare(b.url);
  });
  return ranked;
}

function rootDomain(d: string): string {
  const parts = d.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  if (
    last2 === "gob.mx" ||
    last2 === "edu.mx" ||
    last2 === "gov.mx" ||
    last2 === "com.mx"
  ) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

/**
 * Diversidad suave: primero llena la ventana con máx. maxPerDomain por dominio.
 * Solo si faltan slots y no hay más dominios “frescos”, permite softMaxPerDomain.
 * Así no se sacrifica un resultado excelente cuando no hay alternativa, pero
 * con alternativas relevantes no monopoliza.
 */
export function applyDomainDiversity(
  ranked: readonly RankedResult[],
  options?: {
    maxPerDomain?: number;
    softMaxPerDomain?: number;
    window?: number;
    scoreFloorRatio?: number;
  },
): RankedResult[] {
  const maxPerDomain = options?.maxPerDomain ?? 2;
  const softMax = options?.softMaxPerDomain ?? 3;
  const window = options?.window ?? 10;
  if (ranked.length <= 1) return [...ranked];

  const selected: RankedResult[] = [];
  const used = new Set<number>();
  const counts = new Map<string, number>();

  const tryPick = (maxAllowed: number) => {
    for (let i = 0; i < ranked.length && selected.length < window; i++) {
      if (used.has(i)) continue;
      const r = ranked[i]!;
      const key = rootDomain(r.domain || "");
      const n = counts.get(key) ?? 0;
      if (n >= maxAllowed) continue;
      selected.push(r);
      used.add(i);
      counts.set(key, n + 1);
    }
  };

  tryPick(maxPerDomain);
  // Soft-max solo cuando ya no quedan dominios bajo el tope duro
  const hasRoomUnderHardCap = (): boolean => {
    for (let i = 0; i < ranked.length; i++) {
      if (used.has(i)) continue;
      const key = rootDomain(ranked[i]!.domain || "");
      if ((counts.get(key) ?? 0) < maxPerDomain) return true;
    }
    return false;
  };
  if (selected.length < window && !hasRoomUnderHardCap()) {
    tryPick(softMax);
  }

  for (let i = 0; i < ranked.length; i++) {
    if (used.has(i)) continue;
    selected.push(ranked[i]!);
  }
  return selected;
}
