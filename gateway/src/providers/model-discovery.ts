/**
 * PHASE 63.2 — Descubrimiento de modelos tras validar la conexión.
 *
 * Connection ≠ Model.
 * listModels autentica (cuando el endpoint lo permite) y enumera modelos
 * disponibles para la cuenta; la recomendación es determinista y local.
 */
import fs from "node:fs";
import path from "node:path";
import { assertUrlSafeForFetch } from "../resources/ssrf.ts";
import { resolveProductDataRoot } from "../local-llm/storage.ts";
import { getEffectiveProviderApiKey } from "../setup/llm-key.ts";
import { PERSONAL_AGENT_CLOUD_MODELS } from "./cloud-models.ts";
import {
  firstAvailableModelId,
  resolveRecommendedAgainstAvailable,
} from "./model-recommendation.ts";

export type ModelSelectionMode = "recommended" | "specific";

export type DiscoveryConnectionRef = {
  provider: string;
  modelId: string;
  baseUrl?: string;
  modelSelection?: ModelSelectionMode;
};

/** Modelo devuelto por el proveedor (sin filtrar por capacidades). */
export type ProviderModel = {
  id: string;
  name?: string;
  /** Metadatos opcionales del proveedor; no se usan para filtrar en 63.2. */
  metadata?: Record<string, unknown>;
};

export type ModelDiscoveryStatus =
  | "ok"
  | "failed"
  | "unsupported"
  | "not_discovered";

export type ModelAuthStatus = "ok" | "failed" | "unknown";

export type ModelDiscoveryResult = {
  models: ProviderModel[];
  /**
   * Estática ∩ available. null si el default de PA no está en la respuesta.
   * Nunca inventar un ID que el proveedor no devolvió.
   */
  recommendedModelId?: string | null;
  discoveryStatus: ModelDiscoveryStatus;
  authStatus: ModelAuthStatus;
  /** Código seguro (sin secretos). */
  errorCode?: string;
};

export type ModelAvailabilityStatus =
  | "available"
  | "unavailable"
  | "not_discovered"
  | "discovery_unsupported"
  | "not_selected";

type CachedCatalog = {
  provider: string;
  fetchedAt: number;
  models: ProviderModel[];
  recommendedModelId?: string | null;
  discoveryStatus: ModelDiscoveryStatus;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

function cachePath(): string {
  return path.join(resolveProductDataRoot(), "config", "provider-models-cache.json");
}

function readCacheFile(): Record<string, CachedCatalog> {
  const file = cachePath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      CachedCatalog
    >;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeCacheEntry(entry: CachedCatalog): void {
  const all = readCacheFile();
  all[entry.provider] = entry;
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

export function getCachedProviderModels(
  provider: string,
  opts?: { maxAgeMs?: number },
): CachedCatalog | null {
  const entry = readCacheFile()[provider];
  if (!entry) return null;
  const maxAge = opts?.maxAgeMs ?? CACHE_TTL_MS;
  if (Date.now() - entry.fetchedAt > maxAge) return null;
  return entry;
}

export function clearProviderModelsCache(provider?: string): void {
  if (!provider) {
    const file = cachePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  const all = readCacheFile();
  delete all[provider];
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

function withRecommendation(
  provider: string,
  models: ProviderModel[],
  authStatus: ModelAuthStatus = "ok",
  discoveryStatus: ModelDiscoveryStatus = "ok",
): ModelDiscoveryResult {
  const ids = models.map((m) => m.id);
  const recommended = resolveRecommendedAgainstAvailable(provider, ids);
  return {
    models,
    recommendedModelId: recommended,
    discoveryStatus,
    authStatus,
  };
}

function defaultBaseUrl(
  provider: string,
  connection?: DiscoveryConnectionRef | null,
): string {
  if (connection?.baseUrl?.trim()) return connection.baseUrl.trim().replace(/\/$/, "");
  const map: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    xai: "https://api.x.ai/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
  };
  return map[provider] || "";
}

async function fetchJson(input: {
  url: string;
  headers: Record<string, string>;
  timeoutMs?: number;
}): Promise<{ status: number; body: unknown; raw: string }> {
  const safe = await assertUrlSafeForFetch(input.url);
  if (!safe.ok) {
    throw Object.assign(new Error("base_url_unsafe"), { errorCode: "PROVIDER_INVALID_REQUEST" });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 20_000);
  try {
    const res = await fetch(input.url, {
      method: "GET",
      headers: input.headers,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, raw };
  } finally {
    clearTimeout(timer);
  }
}

function authFailedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function normalizeOpenAiStyleModels(body: unknown): ProviderModel[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: ProviderModel[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: string }).id || "").trim();
    if (!id) continue;
    const name = String(
      (row as { name?: string }).name ||
        (row as { display_name?: string }).display_name ||
        "",
    ).trim();
    out.push({
      id,
      name: name || undefined,
    });
  }
  return out;
}

function normalizeAnthropicModels(body: unknown): ProviderModel[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: ProviderModel[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: string }).id || "").trim();
    if (!id) continue;
    const name = String((row as { display_name?: string }).display_name || "").trim();
    out.push({
      id,
      name: name || undefined,
    });
  }
  return out;
}

async function listOpenAiCompatibleModels(input: {
  provider: string;
  baseUrl: string;
  apiKey: string;
}): Promise<ModelDiscoveryResult> {
  const base = input.baseUrl.replace(/\/$/, "");
  const url = `${base}/models`;
  try {
    const { status, body, raw } = await fetchJson({
      url,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
    });
    if (authFailedStatus(status)) {
      return {
        models: [],
        discoveryStatus: "failed",
        authStatus: "failed",
        errorCode: "PROVIDER_AUTH_FAILED",
      };
    }
    if (status < 200 || status >= 300) {
      return {
        models: [],
        discoveryStatus: "failed",
        authStatus: "unknown",
        errorCode:
          status >= 500 ? "PROVIDER_UNAVAILABLE" : "MODEL_DISCOVERY_FAILED",
      };
    }
    const models = normalizeOpenAiStyleModels(body);
    return withRecommendation(input.provider, models);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return {
      models: [],
      discoveryStatus: "failed",
      authStatus: "unknown",
      errorCode: msg.includes("unsafe")
        ? "PROVIDER_INVALID_REQUEST"
        : "MODEL_DISCOVERY_FAILED",
    };
  }
}

async function listAnthropicModels(apiKey: string): Promise<ModelDiscoveryResult> {
  try {
    const { status, body } = await fetchJson({
      url: "https://api.anthropic.com/v1/models?limit=1000",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        Accept: "application/json",
      },
    });
    if (authFailedStatus(status)) {
      return {
        models: [],
        discoveryStatus: "failed",
        authStatus: "failed",
        errorCode: "PROVIDER_AUTH_FAILED",
      };
    }
    if (status < 200 || status >= 300) {
      return {
        models: [],
        discoveryStatus: "failed",
        authStatus: "unknown",
        errorCode:
          status >= 500 ? "PROVIDER_UNAVAILABLE" : "MODEL_DISCOVERY_FAILED",
      };
    }
    const models = normalizeAnthropicModels(body);
    return withRecommendation("anthropic", models);
  } catch {
    return {
      models: [],
      discoveryStatus: "failed",
      authStatus: "unknown",
      errorCode: "MODEL_DISCOVERY_FAILED",
    };
  }
}

function listCloudModels(): ModelDiscoveryResult {
  const models: ProviderModel[] = PERSONAL_AGENT_CLOUD_MODELS.map((id) => ({
    id,
    name: id.includes("haiku") ? "Claude Haiku" : "Claude Sonnet",
  }));
  return withRecommendation("personal-agent-cloud", models);
}

/**
 * Descubre modelos para un proveedor ya autenticable (Credential Store / Cloud).
 * No devuelve secretos.
 */
export async function discoverProviderModels(input: {
  provider: string;
  connection?: DiscoveryConnectionRef | null;
  apiKey?: string;
  /** Si false, ignora caché. */
  useCache?: boolean;
}): Promise<ModelDiscoveryResult> {
  const provider = input.provider;
  if (provider === "local") {
    return {
      models: [],
      discoveryStatus: "unsupported",
      authStatus: "ok",
    };
  }
  if (provider === "personal-agent-cloud") {
    const result = listCloudModels();
    writeCacheEntry({
      provider,
      fetchedAt: Date.now(),
      models: result.models,
      recommendedModelId: result.recommendedModelId,
      discoveryStatus: result.discoveryStatus,
    });
    return result;
  }

  if (input.useCache !== false) {
    const cached = getCachedProviderModels(provider);
    if (cached && cached.discoveryStatus === "ok" && cached.models.length > 0) {
      // Re-evalúa recomendación estática (puede cambiar sin reconsultar /models).
      return withRecommendation(provider, cached.models);
    }
  }

  const apiKey = (input.apiKey || getEffectiveProviderApiKey(provider)).trim();
  if (!apiKey) {
    return {
      models: [],
      discoveryStatus: "failed",
      authStatus: "failed",
      errorCode: "PROVIDER_NOT_CONFIGURED",
    };
  }

  let result: ModelDiscoveryResult;
  if (provider === "anthropic") {
    result = await listAnthropicModels(apiKey);
  } else if (
    provider === "openai" ||
    provider === "xai" ||
    provider === "gemini" ||
    provider === "openrouter" ||
    provider === "groq" ||
    provider === "openai-compatible"
  ) {
    const base = defaultBaseUrl(provider, input.connection || undefined);
    if (!base) {
      result = {
        models: [],
        discoveryStatus: "failed",
        authStatus: "unknown",
        errorCode: "base_url_required",
      };
    } else {
      result = await listOpenAiCompatibleModels({ provider, baseUrl: base, apiKey });
    }
  } else {
    result = {
      models: [],
      discoveryStatus: "unsupported",
      authStatus: "unknown",
    };
  }

  if (result.discoveryStatus === "ok") {
    writeCacheEntry({
      provider,
      fetchedAt: Date.now(),
      models: result.models,
      recommendedModelId: result.recommendedModelId,
      discoveryStatus: result.discoveryStatus,
    });
  }
  return result;
}

export function modelAvailabilityForConnection(
  connection: DiscoveryConnectionRef,
  discovery: ModelDiscoveryResult,
): ModelAvailabilityStatus {
  if (discovery.discoveryStatus === "unsupported") return "discovery_unsupported";
  if (discovery.discoveryStatus !== "ok") return "not_discovered";
  if (discovery.models.length === 0) return "unavailable";
  if (discovery.models.some((m) => m.id === connection.modelId)) return "available";
  return "unavailable";
}

/**
 * Elige un modelId usable si hace falta un probe (legacy).
 * Preferencia: selected disponible → recommended → primer available.
 */
export function resolveModelForConnectivityProbe(
  connection: DiscoveryConnectionRef,
  discovery: ModelDiscoveryResult,
): string {
  if (
    discovery.discoveryStatus === "ok" &&
    discovery.models.some((m) => m.id === connection.modelId)
  ) {
    return connection.modelId;
  }
  if (discovery.recommendedModelId) return discovery.recommendedModelId;
  const first = firstAvailableModelId(discovery.models.map((m) => m.id));
  if (first) return first;
  return connection.modelId;
}

export function buildModelDiscoveryResult(input: {
  models: ProviderModel[];
  provider: string;
  authStatus?: ModelAuthStatus;
  discoveryStatus?: ModelDiscoveryStatus;
}): ModelDiscoveryResult {
  return withRecommendation(
    input.provider,
    input.models.filter((m) => Boolean(m.id?.trim())),
    input.authStatus ?? "ok",
    input.discoveryStatus ?? "ok",
  );
}

/** Alias explícito del contrato: refresh = discovery sin caché. */
export async function refreshProviderModels(input: {
  provider: string;
  connection?: DiscoveryConnectionRef | null;
  apiKey?: string;
}): Promise<ModelDiscoveryResult> {
  return discoverProviderModels({ ...input, useCache: false });
}
