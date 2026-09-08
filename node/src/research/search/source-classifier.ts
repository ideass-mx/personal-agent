/**
 * Clasificación determinista de fuentes + reglas configurables (PHASE 60.6.1).
 * Sin rankings externos. `.mx` NO implica university.
 */
import type { SourceType } from "./types.ts";

export type SourceRule = {
  /** Glob simple: `*.gob.mx`, host exacto `secihti.mx`, o sufijo `.edu.mx`. */
  readonly pattern: string;
  readonly type: SourceType;
  /** Calidad de dominio 0..1 (opcional). */
  readonly domainQuality?: number;
};

const DEFAULT_SOURCE_RULES: readonly SourceRule[] = [
  { pattern: "*.gob.mx", type: "government", domainQuality: 0.96 },
  { pattern: "*.gov.mx", type: "government", domainQuality: 0.96 },
  { pattern: "*.gov", type: "government", domainQuality: 0.94 },
  { pattern: "*.gob", type: "government", domainQuality: 0.9 },
  { pattern: "*.edu.mx", type: "university", domainQuality: 0.94 },
  { pattern: "*.edu", type: "university", domainQuality: 0.92 },
  { pattern: "secihti.mx", type: "government", domainQuality: 0.97 },
  { pattern: "www.secihti.mx", type: "government", domainQuality: 0.97 },
  { pattern: "conahcyt.mx", type: "government", domainQuality: 0.96 },
  { pattern: "conacyt.mx", type: "government", domainQuality: 0.95 },
  { pattern: "unam.mx", type: "university", domainQuality: 0.96 },
  { pattern: "*.unam.mx", type: "university", domainQuality: 0.96 },
  { pattern: "ipn.mx", type: "university", domainQuality: 0.95 },
  { pattern: "*.ipn.mx", type: "university", domainQuality: 0.95 },
  { pattern: "uaq.mx", type: "university", domainQuality: 0.94 },
  { pattern: "*.uaq.mx", type: "university", domainQuality: 0.94 },
  { pattern: "cinvestav.mx", type: "university", domainQuality: 0.95 },
  { pattern: "colmex.mx", type: "university", domainQuality: 0.94 },
  { pattern: "tec.mx", type: "university", domainQuality: 0.93 },
  { pattern: "itesm.mx", type: "university", domainQuality: 0.93 },
  { pattern: "*.ac.uk", type: "university", domainQuality: 0.93 },
  { pattern: "*.ac.jp", type: "university", domainQuality: 0.92 },
  { pattern: "*.ac.mx", type: "university", domainQuality: 0.93 },
  { pattern: "banxico.org.mx", type: "official", domainQuality: 0.96 },
  { pattern: "www.banxico.org.mx", type: "official", domainQuality: 0.96 },
  { pattern: "dof.gob.mx", type: "government", domainQuality: 0.97 },
  { pattern: "www.dof.gob.mx", type: "government", domainQuality: 0.97 },
  { pattern: "sat.gob.mx", type: "government", domainQuality: 0.96 },
  { pattern: "www.sat.gob.mx", type: "government", domainQuality: 0.96 },
  { pattern: "imss.gob.mx", type: "government", domainQuality: 0.95 },
  { pattern: "www.imss.gob.mx", type: "government", domainQuality: 0.95 },
  { pattern: "arxiv.org", type: "academic", domainQuality: 0.97 },
  { pattern: "*.arxiv.org", type: "academic", domainQuality: 0.97 },
  { pattern: "openalex.org", type: "academic", domainQuality: 0.94 },
  { pattern: "api.openalex.org", type: "academic", domainQuality: 0.94 },
  { pattern: "doi.org", type: "academic", domainQuality: 0.93 },
  { pattern: "crossref.org", type: "academic", domainQuality: 0.93 },
  { pattern: "api.crossref.org", type: "academic", domainQuality: 0.93 },
  { pattern: "pubmed.ncbi.nlm.nih.gov", type: "academic", domainQuality: 0.96 },
  { pattern: "ncbi.nlm.nih.gov", type: "academic", domainQuality: 0.95 },
  { pattern: "semanticscholar.org", type: "academic", domainQuality: 0.92 },
  { pattern: "modelcontextprotocol.io", type: "documentation", domainQuality: 0.95 },
  { pattern: "developer.mozilla.org", type: "documentation", domainQuality: 0.95 },
  { pattern: "react.dev", type: "documentation", domainQuality: 0.94 },
  { pattern: "docs.python.org", type: "documentation", domainQuality: 0.94 },
  { pattern: "nodejs.org", type: "documentation", domainQuality: 0.9 },
  { pattern: "github.com", type: "community", domainQuality: 0.78 },
  { pattern: "stackoverflow.com", type: "community", domainQuality: 0.8 },
  { pattern: "stackexchange.com", type: "community", domainQuality: 0.78 },
];

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase();
  const h = host.toLowerCase();
  if (p.startsWith("*.")) {
    const suffix = p.slice(1); // .gob.mx
    return h === p.slice(2) || h.endsWith(suffix);
  }
  return h === p || h.endsWith(`.${p}`);
}

export function matchSourceRule(
  host: string,
  rules: readonly SourceRule[] = DEFAULT_SOURCE_RULES,
): SourceRule | undefined {
  // Prefer exact / longer patterns: sort by pattern length desc
  const ordered = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const rule of ordered) {
    if (hostMatches(host, rule.pattern)) return rule;
  }
  return undefined;
}

const NEWS_HINTS = [
  "reuters",
  "bbc.",
  "nytimes",
  "elpais",
  "reforma.com",
  "milenio",
  "forbes",
  "bloomberg",
  "cnn.",
];
const BLOG_HINTS = ["medium.com", "blogspot.", "wordpress.", "/blog"];
const UNI_TITLE_HINTS = [
  "universidad",
  "university",
  "instituto politécnico",
  "instituto tecnolog",
];

export function classifySource(
  url: string,
  title = "",
  rules: readonly SourceRule[] = DEFAULT_SOURCE_RULES,
): SourceType {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return "other";
  }

  const rule = matchSourceRule(host, rules);
  if (rule) return rule.type;

  // .ac.* (academic country TLDs) — evidencia estructural
  if (/(^|\.)ac\.[a-z]{2}$/i.test(host)) return "university";

  if (host.startsWith("docs.") || host.includes(".readthedocs.")) {
    return "documentation";
  }
  if (host.endsWith(".stackexchange.com")) return "community";

  const blob = `${host} ${title.toLowerCase()}`;
  // Pistas de universidad en título/host — no usar solo TLD .mx
  if (UNI_TITLE_HINTS.some((h) => blob.includes(h))) return "university";
  if (NEWS_HINTS.some((h) => host.includes(h))) return "news";
  if (BLOG_HINTS.some((h) => host.includes(h) || path.includes(h))) return "blog";

  // .org genérico → official (débil); .mx genérico → other (NO university)
  if (host.endsWith(".org") || host.endsWith(".gob.mx")) return "official";
  if (
    host.includes("shop") ||
    host.includes("store") ||
    host.includes("amazon.")
  ) {
    return "commercial";
  }
  return "other";
}

/** Calidad de dominio 0..1 separada de relevancia léxica. */
export function domainQualityScore(
  urlOrDomain: string,
  rules: readonly SourceRule[] = DEFAULT_SOURCE_RULES,
): number {
  let host = urlOrDomain.toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname.toLowerCase();
  } catch {
    /* keep */
  }
  const rule = matchSourceRule(host, rules);
  if (rule?.domainQuality !== undefined) return rule.domainQuality;

  const type = classifySource(`https://${host}/`, "", rules);
  const byType: Record<SourceType, number> = {
    government: 0.9,
    university: 0.88,
    academic: 0.9,
    official: 0.8,
    documentation: 0.85,
    news: 0.62,
    community: 0.68,
    blog: 0.45,
    commercial: 0.4,
    other: 0.5,
  };
  return byType[type];
}

/** Score de calidad 0..1 según tipo de fuente, dominio e intent. */
export function sourceQualityScore(
  sourceType: SourceType,
  intent?: string,
  domainQuality?: number,
): number {
  const base: Record<SourceType, number> = {
    official: 0.85,
    government: 0.95,
    university: 0.92,
    academic: 0.93,
    documentation: 0.9,
    news: 0.65,
    commercial: 0.4,
    community: 0.7,
    blog: 0.45,
    other: 0.5,
  };
  let q = base[sourceType];
  if (domainQuality !== undefined) {
    q = 0.55 * q + 0.45 * domainQuality;
  }

  if (intent === "academic" && (sourceType === "academic" || sourceType === "university")) {
    q = Math.min(1, q + 0.05);
  }
  if (
    intent === "research" &&
    (sourceType === "government" ||
      sourceType === "university" ||
      sourceType === "academic" ||
      sourceType === "official" ||
      sourceType === "documentation")
  ) {
    q = Math.min(1, q + 0.05);
  }
  if (intent === "technical" && (sourceType === "documentation" || sourceType === "community" || sourceType === "official")) {
    q = Math.min(1, q + 0.05);
  }
  if (intent === "news" && (sourceType === "news" || sourceType === "official" || sourceType === "government")) {
    q = Math.min(1, q + 0.04);
  }
  if (intent === "financial" && (sourceType === "official" || sourceType === "government" || sourceType === "news")) {
    q = Math.min(1, q + 0.05);
  }
  if (
    intent === "local" &&
    (sourceType === "government" || sourceType === "official" || sourceType === "university")
  ) {
    q = Math.min(1, q + 0.05);
  }
  if (intent === "general" && (sourceType === "academic" || sourceType === "university")) {
    // No sobreponderar academic en búsquedas generales
    q = Math.max(0.35, q - 0.08);
  }
  return q;
}

export { DEFAULT_SOURCE_RULES };
