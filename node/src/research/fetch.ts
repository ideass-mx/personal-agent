/**
 * research.fetch — HTTP GET + extracción de texto con protección SSRF.
 */
import {
  extractReadableTextFromHtml,
  looksLikeHtml,
} from "./html-extract.ts";
import { assertUrlSafeForResearchFetch } from "./ssrf.ts";

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_FETCH_MAX_BYTES = 1_048_576;
export const DEFAULT_FETCH_MAX_REDIRECTS = 3;
export const DEFAULT_FETCH_MAX_TEXT_CHARS = 40_000;

export type ResearchFetchRequest = {
  readonly url: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly maxTextChars?: number;
};

export type ResearchFetchSuccess = {
  readonly ok: true;
  readonly url: string;
  readonly finalUrl: string;
  readonly title?: string;
  readonly text: string;
  readonly contentType?: string;
  readonly truncated: boolean;
};

export type ResearchFetchFailure = {
  readonly ok: false;
  readonly code:
    | "invalid_url"
    | "ssrf_blocked"
    | "http_error"
    | "timeout"
    | "aborted"
    | "response_too_large"
    | "empty_content"
    | "redirect_limit"
    | "fetch_failed";
  readonly message: string;
  readonly status?: number;
};

export type ResearchFetchResult = ResearchFetchSuccess | ResearchFetchFailure;

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return undefined;
  const t = m[1].replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, 300) : undefined;
}

async function readBodyLimited(
  res: Response,
  maxBytes: number,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "response_too_large" }
> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, code: "response_too_large" };
    }
  }
  if (!res.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, code: "response_too_large" };
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, bytes: out };
}

export async function researchFetch(
  request: ResearchFetchRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ResearchFetchResult> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = request.maxBytes ?? DEFAULT_FETCH_MAX_BYTES;
  const maxRedirects = request.maxRedirects ?? DEFAULT_FETCH_MAX_REDIRECTS;
  const maxTextChars = request.maxTextChars ?? DEFAULT_FETCH_MAX_TEXT_CHARS;

  let current: string;
  try {
    current = new URL(request.url.trim()).toString();
  } catch {
    return { ok: false, code: "invalid_url", message: "URL inválida" };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertUrlSafeForResearchFetch(current);
    if (!safe.ok) {
      return { ok: false, code: "ssrf_blocked", message: safe.reason };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onExternal = () => ctrl.abort(request.signal?.reason);
    if (request.signal) {
      if (request.signal.aborted) {
        clearTimeout(timer);
        return { ok: false, code: "aborted", message: "Fetch cancelado" };
      }
      request.signal.addEventListener("abort", onExternal, { once: true });
    }

    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "User-Agent": "personal-agent-research/0.1",
        },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        return { ok: false, code: "timeout", message: "Timeout de fetch" };
      }
      return {
        ok: false,
        code: "fetch_failed",
        message: "Error de red en fetch",
      };
    } finally {
      clearTimeout(timer);
      if (request.signal) {
        request.signal.removeEventListener("abort", onExternal);
      }
    }

    if (isRedirect(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) {
        return {
          ok: false,
          code: "http_error",
          message: "Redirect sin Location",
          status: res.status,
        };
      }
      if (hop === maxRedirects) {
        return {
          ok: false,
          code: "redirect_limit",
          message: "Demasiados redirects",
        };
      }
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) {
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        code: "http_error",
        message: `HTTP ${res.status}`,
        status: res.status,
      };
    }

    const body = await readBodyLimited(res, maxBytes);
    if (!body.ok) {
      return {
        ok: false,
        code: "response_too_large",
        message: "Respuesta demasiado grande",
      };
    }

    const contentType = res.headers.get("content-type") ?? undefined;
    const rawText = new TextDecoder("utf-8").decode(body.bytes);
    if (rawText.trim().length === 0) {
      return { ok: false, code: "empty_content", message: "Contenido vacío" };
    }

    let title: string | undefined;
    let text: string;
    if (looksLikeHtml(contentType ?? null, rawText)) {
      title = extractTitle(rawText);
      text = extractReadableTextFromHtml(rawText);
    } else {
      text = rawText;
    }
    if (text.trim().length === 0) {
      return {
        ok: false,
        code: "empty_content",
        message: "Sin texto extraíble",
      };
    }

    const truncated = text.length > maxTextChars;
    if (truncated) text = text.slice(0, maxTextChars);

    return {
      ok: true,
      url: request.url.trim(),
      finalUrl: current,
      ...(title ? { title } : {}),
      text,
      ...(contentType ? { contentType } : {}),
      truncated,
    };
  }

  return {
    ok: false,
    code: "redirect_limit",
    message: "Demasiados redirects",
  };
}
