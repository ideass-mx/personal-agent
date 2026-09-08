/**
 * Configuración interna / development-only para motores de búsqueda locales.
 * No es onboarding ni UI. Sin API keys de usuario.
 */
import type { SearchProviderId } from "./types.ts";
import { DEFAULT_SEARCH_TIMEOUT_MS } from "./types.ts";

export const SEARCH_PROVIDER_ENV = "SEARCH_PROVIDER";
export const WEBSURFX_BASE_URL_ENV = "WEBSURFX_BASE_URL";
export const LIBREY_BASE_URL_ENV = "LIBREY_BASE_URL";
export const SEARCH_TIMEOUT_MS_ENV = "SEARCH_TIMEOUT_MS";
/** Motores zero-key CSV para agent-search-mcp (opcional). */
export const AGENT_SEARCH_ENGINES_ENV = "AGENT_SEARCH_ENGINES";
/**
 * @deprecated PHASE 60.12 — Electron es el provider productivo por defecto.
 * La bandera se conserva solo por compatibilidad; ResearchEngine la ignora.
 */
export const ELECTRON_SERP_ENABLED_ENV = "ELECTRON_SERP_ENABLED";
/** Idle timeout del runtime Electron (default 5 min). */
export const ELECTRON_SERP_IDLE_TIMEOUT_MS_ENV = "ELECTRON_SERP_IDLE_TIMEOUT_MS";

/** Default idle: 5 minutos (research-triggered warm + shutdown por inactividad). */
export const DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export type ResearchSearchConfig = {
  readonly provider: SearchProviderId;
  readonly websurfxBaseUrl?: string;
  readonly libreyBaseUrl?: string;
  readonly timeoutMs: number;
  /** Solo agent-search-mcp. */
  readonly agentSearchEngines?: readonly string[];
  /**
   * @deprecated PHASE 60.12 — siempre true a efectos de ResearchEngine.
   * Router CLI histórico aún puede leerla; default true.
   */
  readonly electronSerpEnabled: boolean;
  /** Idle timeout Electron SERP (ms). */
  readonly electronSerpIdleTimeoutMs: number;
};

const PROVIDERS = new Set<SearchProviderId>([
  "websurfx",
  "librey",
  "agent-search-mcp",
  "personal-agent-search",
  "electron-duckduckgo",
  "web",
]);

const LOCAL_HTTP_PROVIDERS = new Set<SearchProviderId>([
  "websurfx",
  "librey",
]);

export function isLocalHttpSearchProvider(id: SearchProviderId): boolean {
  return LOCAL_HTTP_PROVIDERS.has(id);
}

export function parseSearchProviderId(
  raw: string | undefined,
  fallback: SearchProviderId = "electron-duckduckgo",
): SearchProviderId {
  const v = (raw ?? fallback).trim().toLowerCase();
  if (!PROVIDERS.has(v as SearchProviderId)) {
    throw new Error(`Unsupported search provider: ${raw}`);
  }
  return v as SearchProviderId;
}

function trimUrl(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace(/\/+$/, "");
  return t.length > 0 ? t : undefined;
}

function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SEARCH_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1_000 || n > 120_000) {
    return DEFAULT_SEARCH_TIMEOUT_MS;
  }
  return Math.trunc(n);
}

function parseIdleTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS;
  }
  const n = Number(raw);
  // Permitir 0 (sin idle auto-close) y hasta 1h para experimentos.
  if (!Number.isFinite(n) || n < 0 || n > 3_600_000) {
    return DEFAULT_ELECTRON_SERP_IDLE_TIMEOUT_MS;
  }
  return Math.trunc(n);
}

function parseEngines(raw: string | undefined): readonly string[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

export function parseBoolEnv(
  raw: string | undefined,
  defaultValue = false,
): boolean {
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

/**
 * Lee env de desarrollo. Defaults de URL solo documentados; no inventa hosts.
 * Provider productivo por defecto: electron-duckduckgo (PHASE 60.12).
 */
export function loadResearchSearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResearchSearchConfig {
  return {
    provider: parseSearchProviderId(
      env[SEARCH_PROVIDER_ENV],
      "electron-duckduckgo",
    ),
    websurfxBaseUrl: trimUrl(env[WEBSURFX_BASE_URL_ENV]),
    libreyBaseUrl: trimUrl(env[LIBREY_BASE_URL_ENV]),
    timeoutMs: parseTimeoutMs(env[SEARCH_TIMEOUT_MS_ENV]),
    agentSearchEngines: parseEngines(env[AGENT_SEARCH_ENGINES_ENV]),
    // Deprecated: default true; ResearchEngine ignora el valor.
    electronSerpEnabled: parseBoolEnv(env[ELECTRON_SERP_ENABLED_ENV], true),
    electronSerpIdleTimeoutMs: parseIdleTimeoutMs(
      env[ELECTRON_SERP_IDLE_TIMEOUT_MS_ENV],
    ),
  };
}

export function requireProviderBaseUrl(
  provider: SearchProviderId,
  config: ResearchSearchConfig,
): string {
  if (
    provider === "agent-search-mcp" ||
    provider === "personal-agent-search" ||
    provider === "electron-duckduckgo" ||
    provider === "web"
  ) {
    throw new Error(`${provider} no usa BASE_URL local`);
  }
  const url =
    provider === "websurfx" ? config.websurfxBaseUrl : config.libreyBaseUrl;
  if (!url) {
    const envName =
      provider === "websurfx" ? WEBSURFX_BASE_URL_ENV : LIBREY_BASE_URL_ENV;
    throw new Error(`Falta ${envName} para provider=${provider}`);
  }
  return url;
}
