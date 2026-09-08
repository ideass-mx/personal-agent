/**
 * Planificación determinista de consulta (PHASE 60.6.2).
 * Sin LLM. Inspirado conceptualmente en SearchQuery de metasearch (categorías,
 * idioma, time range) — implementación propia.
 */
import type {
  PaSearchRequest,
  SearchFreshness,
  SearchIntent,
  SourceType,
} from "./types.ts";

export type SearchCategory =
  | "general"
  | "science"
  | "it"
  | "news"
  | "finance"
  | "local"
  | "research";

export type QueryPlan = {
  readonly query: string;
  readonly intent: SearchIntent;
  readonly language: string;
  readonly region?: string;
  readonly preferredSourceTypes: readonly SourceType[];
  readonly freshness: SearchFreshness;
  readonly categories: readonly SearchCategory[];
  /** true si el intent se infirió (no venía en el request). */
  readonly intentInferred: boolean;
};

const ACADEMIC_RE =
  /\b(arxiv|paper|papers|doi|pubmed|openalex|crossref|journal|scholar|investigación|investigacion|thesis|tesis)\b/i;
const RESEARCH_RE =
  /\b(doctorado|doctorados|posgrado|maestr[ií]a|becas?|convocatorias?|universidad(es)?|research|estudio)\b/i;
const TECH_DOCS_RE =
  /\b(documentaci[oó]n|documentation|\bdocs\b|api reference|sdk|server components|readthedocs)\b/i;
const TECH_STACK_RE =
  /\b(react|postgresql|mcp|typescript|javascript|nodejs|vue|kubernetes)\b/i;
const NEWS_RE =
  /\b(noticia|noticias|breaking|headline|hoy|today|latest news)\b/i;
const FIN_RE =
  /\b(precio|price|nvidia|etf|bolsa|mercado|stock|ticker|acciones|nasdaq|ipc)\b/i;
const LOCAL_MX_RE =
  /\b(m[eé]xico|mexicano|tr[aá]mite|sat\.gob|curp|imss|issste|secihti|conahcyt|conacyt)\b/i;
const FRESH_RE =
  /\b(hoy|today|ahora|precio|news|noticia|breaking|202[4-9]|live)\b/i;

const PREFERRED: Record<SearchIntent, readonly SourceType[]> = {
  general: ["official", "documentation", "news", "community", "other"],
  research: [
    "university",
    "government",
    "official",
    "academic",
    "documentation",
  ],
  academic: ["academic", "university", "official"],
  technical: ["documentation", "official", "community", "other"],
  news: ["news", "official", "government"],
  financial: ["official", "news", "government", "commercial"],
  local: ["government", "official", "university", "commercial"],
};

function normalizeLanguage(language?: string, region?: string): string {
  const lang = (language ?? "").trim().toLowerCase();
  const reg = (region ?? "").trim().toLowerCase();
  if (lang.startsWith("es") || reg === "mx") return lang || "es";
  if (lang.startsWith("en")) return "en";
  if (lang) return lang.slice(0, 5);
  return "en";
}

function normalizeRegion(region?: string, language?: string): string | undefined {
  const reg = (region ?? "").trim().toUpperCase();
  if (reg) return reg;
  const lang = (language ?? "").toLowerCase();
  if (lang === "es-mx" || lang.startsWith("es")) return undefined;
  return undefined;
}

export function inferIntent(query: string): SearchIntent {
  const q = query.trim();
  if (FIN_RE.test(q)) return "financial";
  if (NEWS_RE.test(q) && !RESEARCH_RE.test(q)) return "news";
  if (ACADEMIC_RE.test(q) && !LOCAL_MX_RE.test(q)) return "academic";
  if (
    TECH_DOCS_RE.test(q) ||
    (TECH_STACK_RE.test(q) && /\b(doc|guide|tutorial|reference|manual)\b/i.test(q))
  ) {
    if (!RESEARCH_RE.test(q) && !LOCAL_MX_RE.test(q)) return "technical";
  }
  if (RESEARCH_RE.test(q) || (LOCAL_MX_RE.test(q) && /doctorado|universidad|beca|convocatoria/i.test(q))) {
    return "research";
  }
  if (LOCAL_MX_RE.test(q)) return "local";
  return "general";
}

function categoriesFor(intent: SearchIntent): SearchCategory[] {
  switch (intent) {
    case "academic":
      return ["science", "research"];
    case "research":
      return ["research", "science", "general"];
    case "technical":
      return ["it", "general"];
    case "news":
      return ["news", "general"];
    case "financial":
      return ["finance", "news", "general"];
    case "local":
      return ["local", "general"];
    default:
      return ["general"];
  }
}

function freshnessFor(
  intent: SearchIntent,
  query: string,
  explicit?: SearchFreshness,
): SearchFreshness {
  if (explicit && explicit !== "any") return explicit;
  if (intent === "financial" && /\b(hoy|today|ahora|live)\b/i.test(query)) {
    return "day";
  }
  if (intent === "news") return "day";
  if (intent === "financial") return "week";
  if (FRESH_RE.test(query) && (intent === "general" || intent === "local")) {
    return "month";
  }
  return "any";
}

/** Normaliza espacios; no altera significado (sin bangs externos). */
export function normalizeQueryText(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

export function planQuery(request: PaSearchRequest): QueryPlan {
  const query = normalizeQueryText(request.query);
  const intentInferred = request.intent === undefined;
  const intent = request.intent ?? inferIntent(query);
  const language = normalizeLanguage(request.language, request.region);
  const region =
    normalizeRegion(request.region, request.language) ??
    (language.startsWith("es") && LOCAL_MX_RE.test(query) ? "MX" : request.region?.toUpperCase());

  const preferredSourceTypes = PREFERRED[intent];

  return {
    query,
    intent,
    language,
    ...(region ? { region } : {}),
    preferredSourceTypes,
    freshness: freshnessFor(intent, query, request.freshness),
    categories: categoriesFor(intent),
    intentInferred,
  };
}
