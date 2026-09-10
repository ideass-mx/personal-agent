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

export type ModelSelectionMode = "recommended" | "specific";

export type DiscoveryConnectionRef = {
  provider: string;
  modelId: string;
  baseUrl?: string;
  modelSelection?: ModelSelectionMode;
};

export type ProviderModel = {
  id: string;
  name?: string;
  capabilities?: {
    chat?: boolean;
    vision?: boolean;
    tools?: boolean;
    structuredOutput?: boolean;
  };
  contextWindow?: number;
};

export type ModelDiscoveryStatus =
  | "ok"
  | "failed"
  | "unsupported"
  | "not_discovered";

export type ModelAuthStatus = "ok" | "failed" | "unknown";

export type ModelDiscoveryResult = {
  models: ProviderModel[];
  recommendedModelId?: string;
  discoveryStatus: ModelDiscoveryStatus;
  authStatus: ModelAuthStatus;
  /** Código seguro (sin secretos). */
  errorCode?: string;
};

export type ModelAvailabilityStatus =
  | "available"
  | "unavailable"
  | "not_discovered"
  | "discovery_unsupported";

type CachedCatalog = {
  provider: string;
  fetchedAt: number;
  models: ProviderModel[];
  recommendedModelId?: string;
  discoveryStatus: ModelDiscoveryStatus;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

/** Preferencias suaves por proveedor (desempate; no son el único modelo válido). */
const PREFERRED_ID_FRAGMENTS: Record<string, string[]> = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-sonnet-4", "claude-sonnet", "claude-haiku", "claude-opus"],
  xai: ["grok-4.6", "grok-4", "grok-3-mini", "grok"],
  gemini: ["gemini-3.6-flash", "gemini-3.1-pro", "gemini-3-flash", "gemini-flash"],
  openrouter: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet", "google/gemini"],
  groq: ["llama-3.3-70b", "llama-3.1-70b", "llama"],
  "openai-compatible": [],
  "personal-agent-cloud": ["claude-sonnet-4-6", "claude-sonnet", "claude-haiku"],
};

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

function isObviouslyNonChat(id: string): boolean {
  const x = id.toLowerCase();
  return /embedding|embed|tts|whisper|dall-e|image|moderation|realtime|audio|transcri|speech|wav|computer-use|code-search|rerank|guard|aqa|text-embedding|babbage|davinci|curie|ada-00|ft:/.test(
    x,
  );
}

export function filterCompatibleModels(models: ProviderModel[]): ProviderModel[] {
  return models.filter((m) => {
    if (!m.id?.trim()) return false;
    if (m.capabilities?.chat === false) return false;
    if (isObviouslyNonChat(m.id)) return false;
    return true;
  });
}

/**
 * Ranking determinista:
 * chat → tools → structured → context → preferencias del proveedor → id estable.
 */
export function recommendModelId(
  models: ProviderModel[],
  provider: string,
): string | undefined {
  const compatible = filterCompatibleModels(models);
  if (compatible.length === 0) return undefined;
  const prefs = PREFERRED_ID_FRAGMENTS[provider] || [];
  const scored = compatible.map((m) => {
    let score = 100;
    const id = m.id.toLowerCase();
    if (m.capabilities?.chat !== false) score += 50;
    if (m.capabilities?.tools) score += 40;
    if (m.capabilities?.structuredOutput) score += 20;
    if (m.capabilities?.vision) score += 5;
    const ctx = m.contextWindow || 0;
    if (ctx >= 100_000) score += 15;
    else if (ctx >= 32_000) score += 8;
    for (let i = 0; i < prefs.length; i++) {
      if (id.includes(prefs[i].toLowerCase())) {
        score += 80 - i * 8;
        break;
      }
    }
    if (/mini|flash|haiku|fast/.test(id)) score += 6;
    if (/opus|pro(?!-)|ultra/.test(id)) score += 3;
    return { id: m.id, score };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored[0]?.id;
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
    const ctx = Number(
      (row as { context_window?: number }).context_window ||
        (row as { context_length?: number }).context_length ||
        (row as { max_input_tokens?: number }).max_input_tokens ||
        0,
    );
    out.push({
      id,
      name: name || undefined,
      capabilities: { chat: true },
      contextWindow: ctx > 0 ? ctx : undefined,
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
    const ctx = Number((row as { max_input_tokens?: number }).max_input_tokens || 0);
    const caps = (row as { capabilities?: Record<string, unknown> }).capabilities;
    const tools =
      caps && typeof caps === "object"
        ? Boolean(
            (caps as { tools?: { supported?: boolean } }).tools?.supported ??
              (caps as { tool_use?: { supported?: boolean } }).tool_use?.supported,
          )
        : true;
    const structured =
      caps && typeof caps === "object"
        ? Boolean(
            (caps as { structured_outputs?: { supported?: boolean } })
              .structured_outputs?.supported,
          )
        : false;
    out.push({
      id,
      name: name || undefined,
      capabilities: {
        chat: true,
        tools: tools || undefined,
        structuredOutput: structured || undefined,
      },
      contextWindow: ctx > 0 ? ctx : undefined,
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
    const compatible = filterCompatibleModels(models);
    return {
      models: compatible,
      recommendedModelId: recommendModelId(compatible, input.provider),
      discoveryStatus: "ok",
      authStatus: "ok",
    };
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
    const compatible = filterCompatibleModels(models);
    return {
      models: compatible,
      recommendedModelId: recommendModelId(compatible, "anthropic"),
      discoveryStatus: "ok",
      authStatus: "ok",
    };
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
    capabilities: { chat: true, tools: true },
  }));
  return {
    models,
    recommendedModelId: recommendModelId(models, "personal-agent-cloud"),
    discoveryStatus: "ok",
    authStatus: "ok",
  };
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
      return {
        models: cached.models,
        recommendedModelId: cached.recommendedModelId,
        discoveryStatus: "ok",
        authStatus: "ok",
      };
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
 * Elige el modelId a usar en un probe de conectividad (nunca falla solo por
 * un modelId retirado si hay recomendación).
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
  if (discovery.models[0]?.id) return discovery.models[0].id;
  return connection.modelId;
}

export function buildModelDiscoveryResult(input: {
  models: ProviderModel[];
  provider: string;
  authStatus?: ModelAuthStatus;
  discoveryStatus?: ModelDiscoveryStatus;
}): ModelDiscoveryResult {
  const compatible = filterCompatibleModels(input.models);
  return {
    models: compatible,
    recommendedModelId: recommendModelId(compatible, input.provider),
    discoveryStatus: input.discoveryStatus ?? "ok",
    authStatus: input.authStatus ?? "ok",
  };
}
