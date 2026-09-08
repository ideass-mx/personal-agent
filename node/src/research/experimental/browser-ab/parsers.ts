/**
 * Parsers deterministas de HTML SERP (fixtures / snapshots) — sin evasión.
 */
export type ParsedHit = {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extrae resultados estilo DDG HTML (result__a). */
export function parseDuckDuckGoHtmlResults(html: string, limit = 10): ParsedHit[] {
  const out: ParsedHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let url = (m[1] ?? "").replace(/&amp;/g, "&");
    try {
      const u = new URL(url.startsWith("http") ? url : `https://duckduckgo.com${url}`);
      const uddg = u.searchParams.get("uddg");
      if (uddg) url = decodeURIComponent(uddg);
    } catch {
      continue;
    }
    if (!url.startsWith("http") || seen.has(url)) continue;
    seen.add(url);
    const title = strip(m[2] ?? "");
    if (title.length < 2) continue;
    out.push({
      position: out.length + 1,
      title,
      url,
      domain: domainOf(url),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Extrae resultados estilo Mojeek (class ob). */
export function parseMojeekHtmlResults(html: string, limit = 10): ParsedHit[] {
  const out: ParsedHit[] = [];
  const re =
    /<a[^>]*class="[^"]*\bob\b[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1] ?? "";
    const title = strip(m[2] ?? "");
    if (!url || seen.has(url) || title.length < 2) continue;
    seen.add(url);
    out.push({
      position: out.length + 1,
      title,
      url,
      domain: domainOf(url),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Resultados genéricos de lista visible (navegador): enlaces externos con texto. */
export function parseGenericSerpLinks(
  links: readonly { href: string; text: string }[],
  excludeHosts: readonly string[],
  limit = 10,
): ParsedHit[] {
  const out: ParsedHit[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    let url = l.href;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (excludeHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
        continue;
      }
      url = u.toString();
    } catch {
      continue;
    }
    const title = l.text.trim();
    if (title.length < 3 || seen.has(url)) continue;
    seen.add(url);
    out.push({
      position: out.length + 1,
      title: title.slice(0, 200),
      url,
      domain: domainOf(url),
    });
    if (out.length >= limit) break;
  }
  return out;
}
