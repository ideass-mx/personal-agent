/**
 * HTTP mínimo para providers del Search Engine (sin secretos en logs).
 */
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PaSearchError,
} from "./types.ts";

/** UA genérico; scrapers HTML pueden sobrescribir con un UA de navegador. */
const UA = "PersonalAgentResearch/0.1 (+https://ideass.mx; research)";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type FetchTextOptions = {
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly body?: string;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly provider: string;
  readonly maxBytes?: number;
  /**
   * Si true, no lanza en status HTTP de error; el caller clasifica.
   * Timeout / abort / red sí lanzan.
   */
  readonly acceptErrorStatus?: boolean;
};

export type FetchTextResult = {
  readonly status: number;
  readonly text: string;
};

function isRateLimitStatus(status: number): boolean {
  return status === 429 || status === 403 || status === 503;
}

export async function fetchText(
  options: FetchTextOptions,
): Promise<FetchTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(options.url, {
      method: options.method ?? "GET",
      body: options.body,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...options.headers,
      },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new PaSearchError("invalid_response", "Respuesta demasiado grande", {
        provider: options.provider,
      });
    }
    const text = new TextDecoder("utf-8").decode(buf);
    if (!res.ok && !options.acceptErrorStatus) {
      if (isRateLimitStatus(res.status)) {
        throw new PaSearchError("rate_limited", `HTTP ${res.status}`, {
          provider: options.provider,
        });
      }
      throw new PaSearchError("http_error", `HTTP ${res.status}`, {
        provider: options.provider,
      });
    }
    return { status: res.status, text };
  } catch (err) {
    if (err instanceof PaSearchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      if (options.signal?.aborted) {
        throw new PaSearchError("aborted", "Cancelado", {
          provider: options.provider,
          cause: err,
        });
      }
      throw new PaSearchError("timeout", "Timeout provider", {
        provider: options.provider,
        cause: err,
      });
    }
    throw new PaSearchError("http_error", "Error de red", {
      provider: options.provider,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchJson(
  options: FetchTextOptions,
): Promise<unknown> {
  const { text, status } = await fetchText({
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });
  if (status < 200 || status >= 300) {
    if (isRateLimitStatus(status)) {
      throw new PaSearchError("rate_limited", `HTTP ${status}`, {
        provider: options.provider,
      });
    }
    throw new PaSearchError("http_error", `HTTP ${status}`, {
      provider: options.provider,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new PaSearchError("parse_error", "JSON inválido", {
      provider: options.provider,
      cause: err,
    });
  }
}

export type RetryOptions = {
  readonly maxRetries: number;
  readonly baseDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly shouldRetry: (err: unknown) => boolean;
};

/** Retry limitado con backoff lineal (sin evadir anti-abuso). */
export async function withLimitedRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const base = options.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new PaSearchError("aborted", "Cancelado");
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= options.maxRetries || !options.shouldRetry(err)) throw err;
      const delay = base * (attempt + 1);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        const onAbort = () => {
          clearTimeout(t);
          reject(new PaSearchError("aborted", "Cancelado"));
        };
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        options.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw lastErr;
}

export function isTransientProviderError(err: unknown): boolean {
  return (
    err instanceof PaSearchError &&
    (err.code === "timeout" || err.code === "http_error")
  );
}
