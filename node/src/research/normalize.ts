/**
 * Normalización compartida de resultados de búsqueda (sin formatos propietarios).
 */
import type { SearchResult } from "./types.ts";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "./types.ts";

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT;
  const n = Math.trunc(limit);
  if (n < 1) return 1;
  if (n > MAX_SEARCH_LIMIT) return MAX_SEARCH_LIMIT;
  return n;
}

export function requireQuery(query: unknown): string {
  if (typeof query !== "string") {
    throw new Error("query debe ser string");
  }
  const q = query.trim();
  if (q.length === 0) {
    throw new Error("query no puede estar vacía");
  }
  if (q.length > 500) {
    throw new Error("query demasiado larga");
  }
  return q;
}

export function domainFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.hostname || undefined;
  } catch {
    return undefined;
  }
}

function asOptionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Construye un SearchResult a partir de campos crudos.
 * Omite entradas sin title+url válidos.
 */
export function normalizeResult(raw: {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  domain?: unknown;
  publishedAt?: unknown;
}): SearchResult | null {
  const title = asOptionalString(raw.title);
  const url = asOptionalString(raw.url);
  if (!title || !url) return null;
  try {
    // Solo http(s); no ejecutar ni seguir el enlace aquí.
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  const snippet = asOptionalString(raw.snippet);
  const domain = asOptionalString(raw.domain) ?? domainFromUrl(url);
  const publishedAt = asOptionalString(raw.publishedAt);

  return {
    title,
    url,
    ...(snippet !== undefined ? { snippet } : {}),
    ...(domain !== undefined ? { domain } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  };
}

export function takeResults(
  items: Array<SearchResult | null>,
  limit: number,
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const item of items) {
    if (!item) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
