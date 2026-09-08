/**
 * Extracción mínima HTML → texto legible (sin ejecutar JS).
 * Sin dependencias nuevas.
 */

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    });
}

/**
 * Quita scripts/styles/noscript y etiquetas; colapsa whitespace.
 */
export function extractReadableTextFromHtml(html: string): string {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeBasicEntities(s);
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function looksLikeHtml(contentType: string | null, body: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return true;
  const head = body.slice(0, 256).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype html");
}
