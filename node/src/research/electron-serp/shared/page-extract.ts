/**
 * Extracto de página SERP compartido (Electron DDG / Brave).
 */

export type PageExtract = {
  readonly title: string;
  readonly url: string;
  readonly bodyText: string;
  readonly links: readonly { href: string; text: string }[];
};

/** Extrae candidatos de enlaces desde el DOM (evaluación en página). */
export const EXTRACT_LINKS_EXPRESSION = `(() => {
  const links = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    const text = (a.textContent || "").trim();
    if (!href || text.length < 3) continue;
    links.push({ href, text: text.slice(0, 200) });
  }
  return {
    title: document.title || "",
    url: location.href,
    bodyText: (document.body && document.body.innerText || "").slice(0, 4000),
    links
  };
})()`;

/** Extrae enlaces <a> de HTML (fixtures / recovery). */
export function parseLinksFromHtml(
  html: string,
): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]!.trim();
    const text = m[2]!.replace(/<[^>]+>/g, "").trim();
    if (href && text.length >= 3) out.push({ href, text: text.slice(0, 200) });
  }
  return out;
}

export function pageExtractFromHtml(
  html: string,
  url = "https://duckduckgo.com/",
): PageExtract {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1]!.replace(/<[^>]+>/g, "").trim() : "";
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  return {
    title,
    url,
    bodyText,
    links: parseLinksFromHtml(html),
  };
}
