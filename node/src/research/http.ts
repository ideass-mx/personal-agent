/**
 * Cliente HTTP de solo lectura para motores de búsqueda locales.
 * GET únicamente; timeout; tope de bytes; redirects acotados; AbortSignal.
 */
import {
  MAX_SEARCH_REDIRECTS,
  MAX_SEARCH_RESPONSE_BYTES,
  DEFAULT_SEARCH_TIMEOUT_MS,
  SearchError,
} from "./types.ts";

export type SearchHttpGetOptions = {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly provider: string;
};

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function mergeSignals(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new SearchError("timeout", "Timeout de búsqueda", { provider: undefined }));
  }, timeoutMs);

  const onExternalAbort = () => {
    ctrl.abort(external?.reason ?? new SearchError("aborted", "Búsqueda cancelada"));
  };

  if (external) {
    if (external.aborted) {
      onExternalAbort();
    } else {
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: ctrl.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onExternalAbort);
    },
  };
}

function mapAbortError(err: unknown, provider: string): SearchError {
  if (err instanceof SearchError) {
    return new SearchError(err.code, err.message, {
      provider,
      status: err.status,
      cause: err,
    });
  }

  const dig = (v: unknown): SearchError | undefined => {
    if (v instanceof SearchError) return v;
    if (v instanceof Error && v.cause !== undefined) return dig(v.cause);
    return undefined;
  };
  const nested = dig(err);
  if (nested) {
    return new SearchError(nested.code, nested.message, {
      provider,
      status: nested.status,
      cause: err,
    });
  }

  if (err instanceof Error && err.name === "AbortError") {
    return new SearchError("aborted", "Búsqueda cancelada", {
      provider,
      cause: err,
    });
  }
  return new SearchError("http_error", "Error de red en búsqueda", {
    provider,
    cause: err,
  });
}

/**
 * GET JSON. No ejecuta HTML/JS. No registra query ni cuerpo.
 */
export async function searchHttpGetJson(
  options: SearchHttpGetOptions,
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_SEARCH_RESPONSE_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_SEARCH_REDIRECTS;
  const provider = options.provider;

  let current = options.url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { signal, cleanup } = mergeSignals(timeoutMs, options.signal);
    try {
      let res: Response;
      try {
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal,
          headers: {
            Accept: "application/json",
            // Identidad mínima; sin tokens.
            "User-Agent": "personal-agent-research/0.1",
          },
        });
      } catch (err) {
        throw mapAbortError(err, provider);
      }

      if (isRedirect(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new SearchError("http_error", `Redirect sin Location (${res.status})`, {
            provider,
            status: res.status,
          });
        }
        if (hop === maxRedirects) {
          throw new SearchError(
            "redirect_limit",
            "Demasiados redirects en búsqueda",
            { provider, status: res.status },
          );
        }
        current = new URL(loc, current).toString();
        const scheme = new URL(current).protocol;
        if (scheme !== "http:" && scheme !== "https:") {
          throw new SearchError("http_error", "Redirect a esquema no permitido", {
            provider,
            status: res.status,
          });
        }
        continue;
      }

      if (!res.ok) {
        // Consumir cuerpo sin loguearlo.
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        throw new SearchError("http_error", `HTTP ${res.status}`, {
          provider,
          status: res.status,
        });
      }

      const buf = await readBodyLimited(res, maxBytes, provider);
      const text = new TextDecoder("utf-8").decode(buf);
      try {
        return JSON.parse(text) as unknown;
      } catch (err) {
        throw new SearchError("invalid_json", "Respuesta JSON inválida", {
          provider,
          cause: err,
        });
      }
    } finally {
      cleanup();
    }
  }

  throw new SearchError("redirect_limit", "Demasiados redirects en búsqueda", {
    provider,
  });
}

async function readBodyLimited(
  res: Response,
  maxBytes: number,
  provider: string,
): Promise<Uint8Array> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new SearchError(
        "response_too_large",
        "Respuesta de búsqueda demasiado grande",
        { provider },
      );
    }
  }

  if (!res.body) {
    return new Uint8Array(0);
  }

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
      throw new SearchError(
        "response_too_large",
        "Respuesta de búsqueda demasiado grande",
        { provider },
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
