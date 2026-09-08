/**
 * Capacidades de provider + selección (PHASE 60.6.3 / 60.6.4).
 * Sin fallback disfrazado (OpenAlex solo si el plan pide academic/research).
 */
import type { QueryPlan, SearchCategory } from "./query-plan.ts";
import type { PaSearchProviderId } from "./types.ts";

export type ProviderFacet =
  | "general"
  | "news"
  | "academic"
  | "technical"
  | "government"
  | "knowledge"
  | "financial";

export type ProviderCapabilities = {
  readonly id: PaSearchProviderId;
  readonly facets: Readonly<Partial<Record<ProviderFacet, boolean>>>;
  readonly categories: readonly SearchCategory[];
  readonly languages: readonly string[];
  readonly regions: readonly string[];
  readonly supportsLanguage: boolean;
  readonly supportsRegion: boolean;
  readonly supportsFreshness: boolean;
  readonly supportsSafeSearch: boolean;
  readonly confidence: number;
  readonly stability: "stable" | "fragile";
  readonly generalWeb: boolean;
  readonly academic: boolean;
  readonly localeAware: boolean;
};

/** @deprecated alias */
export type ProviderCapability = ProviderCapabilities;

export const PROVIDER_CAPABILITIES: readonly ProviderCapabilities[] = [
  {
    id: "duckduckgo",
    facets: {
      general: true,
      news: true,
      technical: true,
      financial: true,
      government: true,
    },
    categories: ["general", "news", "it", "local", "finance", "research"],
    languages: ["*"],
    regions: ["*"],
    supportsLanguage: true,
    supportsRegion: true,
    supportsFreshness: false,
    supportsSafeSearch: false,
    confidence: 0.4,
    stability: "fragile",
    generalWeb: true,
    academic: false,
    localeAware: true,
  },
  {
    id: "mojeek",
    facets: { general: true, technical: true },
    categories: ["general", "it", "research"],
    languages: ["en", "es"],
    regions: [],
    supportsLanguage: true,
    supportsRegion: false,
    supportsFreshness: false,
    supportsSafeSearch: false,
    confidence: 0.35,
    stability: "fragile",
    generalWeb: true,
    academic: false,
    localeAware: true,
  },
  {
    id: "duckduckgo-ia",
    facets: { knowledge: true, general: true },
    categories: ["general", "science", "it"],
    languages: ["*"],
    regions: ["*"],
    supportsLanguage: true,
    supportsRegion: true,
    supportsFreshness: false,
    supportsSafeSearch: false,
    confidence: 0.72,
    stability: "stable",
    generalWeb: false,
    academic: false,
    localeAware: true,
  },
  {
    id: "wikipedia",
    facets: { knowledge: true, general: true, technical: true },
    categories: ["general", "science", "it", "research"],
    languages: ["*"],
    regions: [],
    supportsLanguage: true,
    supportsRegion: false,
    supportsFreshness: false,
    supportsSafeSearch: false,
    confidence: 0.8,
    stability: "stable",
    generalWeb: false,
    academic: false,
    localeAware: true,
  },
  {
    id: "hackernews",
    facets: { technical: true, news: true },
    categories: ["it", "news", "general"],
    languages: ["en"],
    regions: [],
    supportsLanguage: false,
    supportsRegion: false,
    supportsFreshness: true,
    supportsSafeSearch: false,
    confidence: 0.7,
    stability: "stable",
    generalWeb: false,
    academic: false,
    localeAware: false,
  },
  {
    id: "mx-official",
    facets: { government: true, knowledge: true },
    categories: ["local", "research", "finance", "general"],
    languages: ["es"],
    regions: ["MX"],
    supportsLanguage: true,
    supportsRegion: true,
    supportsFreshness: false,
    supportsSafeSearch: false,
    confidence: 0.88,
    stability: "stable",
    generalWeb: false,
    academic: false,
    localeAware: true,
  },
  {
    id: "arxiv",
    facets: { academic: true },
    categories: ["science", "research"],
    languages: ["en"],
    regions: [],
    supportsLanguage: false,
    supportsRegion: false,
    supportsFreshness: true,
    supportsSafeSearch: false,
    confidence: 0.85,
    stability: "stable",
    generalWeb: false,
    academic: true,
    localeAware: false,
  },
  {
    id: "openalex",
    facets: { academic: true },
    categories: ["science", "research"],
    languages: ["*"],
    regions: [],
    supportsLanguage: true,
    supportsRegion: false,
    supportsFreshness: true,
    supportsSafeSearch: false,
    confidence: 0.92,
    stability: "stable",
    generalWeb: false,
    academic: true,
    localeAware: false,
  },
  {
    id: "crossref",
    facets: { academic: true },
    categories: ["science", "research"],
    languages: ["*"],
    regions: [],
    supportsLanguage: false,
    supportsRegion: false,
    supportsFreshness: true,
    supportsSafeSearch: false,
    confidence: 0.92,
    stability: "stable",
    generalWeb: false,
    academic: true,
    localeAware: false,
  },
];

const CAP_BY_ID = new Map(
  PROVIDER_CAPABILITIES.map((c) => [c.id, c] as const),
);

export function getProviderCapabilities(
  id: PaSearchProviderId,
): ProviderCapabilities | undefined {
  return CAP_BY_ID.get(id);
}

export function facetsForPlan(plan: QueryPlan): ProviderFacet[] {
  switch (plan.intent) {
    case "academic":
      return ["academic", "knowledge"];
    case "research":
      return ["general", "academic", "knowledge", "government"];
    case "technical":
      return ["general", "technical", "knowledge"];
    case "news":
      return ["news", "general", "knowledge"];
    case "financial":
      return ["financial", "news", "general", "government"];
    case "local":
      return ["general", "government", "knowledge"];
    case "general":
    default:
      return ["general", "knowledge"];
  }
}

function languageCompatible(cap: ProviderCapabilities, language: string): boolean {
  if (!cap.supportsLanguage) return true;
  if (cap.languages.includes("*")) return true;
  const lang = language.toLowerCase().slice(0, 2);
  return cap.languages.some((l) => l.toLowerCase().startsWith(lang));
}

function regionCompatible(cap: ProviderCapabilities, region?: string): boolean {
  if (!region) return true;
  if (!cap.supportsRegion) {
    // mx-official sin region en request aún puede ser útil si language=es
    return cap.regions.length === 0;
  }
  if (cap.regions.includes("*")) return true;
  return cap.regions.map((r) => r.toUpperCase()).includes(region.toUpperCase());
}

export function scoreProviderForPlan(
  cap: ProviderCapabilities,
  plan: QueryPlan,
): number {
  const needed = facetsForPlan(plan);
  let facetScore = 0;
  for (const f of needed) {
    if (cap.facets[f]) facetScore += 1;
  }
  if (facetScore === 0) return 0;

  let score = facetScore / needed.length;
  score *= 0.7 + 0.3 * cap.confidence;

  if (!languageCompatible(cap, plan.language)) score *= 0.5;

  // Boost MX official cuando region=MX o language=es
  if (cap.id === "mx-official") {
    const reg = (plan.region ?? "").toUpperCase();
    const lang = plan.language.toLowerCase();
    if (reg === "MX" || lang.startsWith("es")) score += 0.15;
    else score *= 0.4;
  } else if (!regionCompatible(cap, plan.region)) {
    score *= 0.85;
  }

  if (plan.freshness !== "any" && cap.supportsFreshness) score += 0.05;
  if (cap.stability === "fragile") score *= 0.9;

  return Number(score.toFixed(4));
}

/**
 * Selección por capacidades únicamente.
 * OpenAlex/Crossref/Arxiv solo si facet academic encaja (intent academic|research).
 * Sin safety net / fallback disfrazado.
 */
export function selectProvidersForPlan(
  plan: QueryPlan,
  available: readonly PaSearchProviderId[],
): PaSearchProviderId[] {
  const avail = available.filter((id) => CAP_BY_ID.has(id));
  if (avail.length === 0) return [...available];

  const scored = avail
    .map((id) => {
      const cap = CAP_BY_ID.get(id)!;
      return { id, score: scoreProviderForPlan(cap, plan) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Sin safety net: si ningún provider encaja, lista vacía (no reinyectar todos).
  return scored.map((s) => s.id);
}

export function providerConfidence(id: PaSearchProviderId): number {
  return CAP_BY_ID.get(id)?.confidence ?? 0.5;
}

export function anySupportsSafeSearch(
  ids: readonly PaSearchProviderId[],
): boolean {
  return ids.some((id) => CAP_BY_ID.get(id)?.supportsSafeSearch === true);
}

export function stripUnsupportedRequestFlags(
  ids: readonly PaSearchProviderId[],
  request: { safeSearch?: boolean },
): { safeSearch?: boolean } {
  if (request.safeSearch && anySupportsSafeSearch(ids)) {
    return { safeSearch: true };
  }
  return {};
}
