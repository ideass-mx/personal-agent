import fs from "node:fs";
import path from "node:path";
import { ensureLocalIdentity } from "../identity/ensure-local.ts";
import {
  advisePrimaryModel,
  createLocalModelManager,
  createLocalProvider,
  detectHardware,
  getLocalModelEntry,
  isLocalLlmConfigured,
  readLlmPreference,
  type LocalLLMRuntime,
  type LocalModelManager,
} from "../local-llm/index.ts";
import {
  clearPersistedProviderApiKey,
  getEffectiveProviderApiKey,
  hasProviderApiKeyConfigured,
  writePersistedProviderApiKey,
} from "../setup/llm-key.ts";
import { assertUrlSafeForFetch } from "../resources/ssrf.ts";
import {
  isPersonalAgentCloudModel,
  resolvePersonalAgentCloudModelId,
} from "./cloud-models.ts";
import { createAnthropicProvider } from "./anthropic.ts";
export {
  PERSONAL_AGENT_CLOUD_MODELS,
  resolvePersonalAgentCloudModelId,
  isPersonalAgentCloudModel,
} from "./cloud-models.ts";
import { createOpenAiCompatibleProvider } from "./openai-compatible.ts";
import {
  createPersonalAgentCloudProvider,
  getCloudAuthClient,
  isCloudDevAuthEnabled,
  resolvePersonalAgentCloudBaseUrl,
} from "./cloud-auth/index.ts";
import type { LLMProvider, LLMRequest } from "./types.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { AgentDiagnosticError } from "../diagnostics/error.ts";
import { resolveProductDataRoot } from "../local-llm/storage.ts";
import { CloudAuthError, userMessageForCloudAuth } from "./cloud-auth/types.ts";
import type { ModelSelectionMode } from "./model-discovery.ts";
import {
  clearProviderModelsCache,
  getCachedProviderModels,
  modelAvailabilityForConnection,
  type ModelAvailabilityStatus,
  type ModelDiscoveryResult,
  type ProviderModel,
} from "./model-discovery.ts";

export type IntelligenceMode = "local" | "personal-agent-cloud" | "external";
export type IntelligenceProviderId =
  | "local"
  | "personal-agent-cloud"
  | "openai"
  | "anthropic"
  | "xai"
  | "gemini"
  | "openrouter"
  | "groq"
  | "openai-compatible";

export type LLMConnection = {
  id: string;
  mode: IntelligenceMode;
  provider: IntelligenceProviderId;
  modelId: string;
  displayName: string;
  credentialRef?: string;
  baseUrl?: string;
  /**
   * recommended = Personal Agent puede actualizar el modelo tras discovery.
   * specific = el usuario fijó un modelId; no se cambia en silencio.
   */
  modelSelection?: ModelSelectionMode;
};

type IntelligenceConfig = {
  selectedConnectionId: string;
  connections: LLMConnection[];
};

const DEFAULT_CONNECTIONS: LLMConnection[] = [
  {
    id: "conn_local_default",
    mode: "local",
    provider: "local",
    modelId: "qwen3-4b",
    displayName: "Qwen3 4B",
  },
  {
    id: "conn_cloud_default",
    mode: "personal-agent-cloud",
    provider: "personal-agent-cloud",
    modelId: "claude-sonnet-4-6",
    displayName: "Personal Agent Cloud",
    modelSelection: "recommended",
  },
];

function intelligenceConfigPath(): string {
  return path.join(resolveProductDataRoot(), "config", "intelligence.json");
}

function defaultConfig(): IntelligenceConfig {
  const pref = readLlmPreference();
  const selectedConnectionId =
    pref?.provider === "anthropic" ? "conn_ext_anthropic" : "conn_local_default";
  const extAnthropic: LLMConnection = {
    id: "conn_ext_anthropic",
    mode: "external",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    displayName: "Anthropic",
    credentialRef: hasProviderApiKeyConfigured("anthropic")
      ? "cred_ref_anthropic"
      : undefined,
  };
  return {
    selectedConnectionId,
    connections: [...DEFAULT_CONNECTIONS, extAnthropic],
  };
}

export function readIntelligenceConfig(): IntelligenceConfig {
  const file = intelligenceConfigPath();
  if (!fs.existsSync(file)) return defaultConfig();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as IntelligenceConfig;
    if (!raw || !Array.isArray(raw.connections) || !raw.selectedConnectionId) {
      return defaultConfig();
    }
    return raw;
  } catch {
    return defaultConfig();
  }
}

export function writeIntelligenceConfig(cfg: IntelligenceConfig): void {
  const file = intelligenceConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf8");
}

export function getIntelligenceConnection(
  id?: string,
): LLMConnection | null {
  const cfg = readIntelligenceConfig();
  const selected = cfg.connections.find((c) => c.id === (id || cfg.selectedConnectionId));
  return selected || null;
}

export function listIntelligenceConnections(): LLMConnection[] {
  return readIntelligenceConfig().connections.map((x) => ({ ...x }));
}

export function selectIntelligenceConnection(connectionId: string): LLMConnection {
  const cfg = readIntelligenceConfig();
  const found = cfg.connections.find((c) => c.id === connectionId);
  if (!found) throw new Error("connection_not_found");
  cfg.selectedConnectionId = found.id;
  writeIntelligenceConfig(cfg);
  return found;
}

/**
 * Cambia el modelo de una conexión (Local, Cloud Claude o BYOK).
 * En BYOK/Cloud marca selección explícita (specific).
 */
export function updateIntelligenceConnectionModel(
  connectionId: string,
  modelId: string,
  opts?: { selection?: ModelSelectionMode },
): LLMConnection {
  const mid = modelId.trim();
  if (!mid) throw new Error("model_required");
  const cfg = readIntelligenceConfig();
  const found = cfg.connections.find((c) => c.id === connectionId);
  if (!found) throw new Error("connection_not_found");
  if (found.mode === "personal-agent-cloud") {
    const midCloud = resolvePersonalAgentCloudModelId(mid);
    if (!isPersonalAgentCloudModel(midCloud)) {
      throw new Error("model_not_allowed");
    }
    found.modelId = midCloud;
    found.displayName = "Personal Agent Cloud";
    found.modelSelection = opts?.selection ?? "specific";
  } else if (found.mode === "local") {
    const entry = getLocalModelEntry(mid);
    if (!entry) throw new Error("model_not_in_catalog");
    const manager = createLocalModelManager();
    if (!manager.isInstalled(mid)) throw new Error("model_not_installed");
    manager.setActive(mid);
    found.modelId = mid;
    found.displayName = entry.displayName;
  } else {
    if (!hasProviderApiKeyConfigured(found.provider)) {
      throw new Error("credential_required");
    }
    found.modelId = mid;
    found.modelSelection = opts?.selection ?? "specific";
  }
  writeIntelligenceConfig(cfg);
  return { ...found };
}

export async function upsertExternalConnection(input: {
  provider: Exclude<IntelligenceProviderId, "local" | "personal-agent-cloud">;
  modelId?: string;
  apiKey: string;
  baseUrl?: string;
  modelSelection?: ModelSelectionMode;
}): Promise<LLMConnection> {
  const provider = input.provider;
  const modelId = (input.modelId || "").trim();
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 10) throw new Error("invalid_credential");
  const cfg = readIntelligenceConfig();

  const connId = `conn_ext_${provider}`;
  let baseUrl = input.baseUrl?.trim();
  if (provider === "openai" && !baseUrl) baseUrl = "https://api.openai.com/v1";
  if (provider === "xai" && !baseUrl) baseUrl = "https://api.x.ai/v1";
  if (provider === "gemini" && !baseUrl) {
    baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  if (provider === "openrouter" && !baseUrl) baseUrl = "https://openrouter.ai/api/v1";
  if (provider === "groq" && !baseUrl) baseUrl = "https://api.groq.com/openai/v1";
  if (provider === "openai-compatible") {
    if (!baseUrl) throw new Error("base_url_required");
  }
  if (baseUrl) {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("base_url_invalid");
    const safe = await assertUrlSafeForFetch(baseUrl);
    if (!safe.ok) throw new Error("base_url_unsafe");
  }
  writePersistedProviderApiKey(provider, apiKey);
  clearProviderModelsCache(provider);
  const selection: ModelSelectionMode =
    input.modelSelection ||
    (modelId ? "specific" : "recommended");
  const connection: LLMConnection = {
    id: connId,
    mode: "external",
    provider,
    modelId: modelId || "__pending_discovery__",
    displayName:
      provider === "openai-compatible"
        ? "Compatible con OpenAI"
        : provider === "xai"
          ? "xAI / Grok"
          : provider === "gemini"
            ? "Gemini"
            : provider === "openai"
              ? "OpenAI"
              : provider === "anthropic"
                ? "Anthropic"
                : provider === "openrouter"
                  ? "OpenRouter"
                  : provider === "groq"
                    ? "Groq"
                    : String(provider),
    credentialRef: `cred_ref_${provider}`,
    baseUrl,
    modelSelection: selection,
  };
  const others = cfg.connections.filter((c) => c.id !== connId);
  cfg.connections = [...others, connection];
  cfg.selectedConnectionId = connId;
  writeIntelligenceConfig(cfg);
  return connection;
}

/**
 * Aplica el resultado de discovery a la conexión persistida.
 * - selection recommended → actualiza modelId al recomendado
 * - selection specific + modelo ausente → no cambia modelId (queda unavailable)
 */
export function applyModelDiscoveryToConnection(
  connectionId: string,
  discovery: ModelDiscoveryResult,
): LLMConnection {
  const cfg = readIntelligenceConfig();
  const found = cfg.connections.find((c) => c.id === connectionId);
  if (!found) throw new Error("connection_not_found");
  const selection = found.modelSelection || "recommended";
  if (discovery.discoveryStatus === "ok") {
    if (selection === "recommended" && discovery.recommendedModelId) {
      found.modelId = discovery.recommendedModelId;
      found.modelSelection = "recommended";
    } else if (
      selection === "recommended" &&
      !discovery.recommendedModelId &&
      discovery.models[0]?.id
    ) {
      found.modelId = discovery.models[0].id;
      found.modelSelection = "recommended";
    } else if (
      found.modelId === "__pending_discovery__" &&
      discovery.recommendedModelId
    ) {
      found.modelId = discovery.recommendedModelId;
      found.modelSelection = "recommended";
    }
  }
  writeIntelligenceConfig(cfg);
  return { ...found };
}

export type ConnectionConfigStatus =
  | "active"
  | "configured"
  | "not_configured";

export type IntelligenceConnectionView = {
  id: string;
  mode: IntelligenceMode;
  provider: IntelligenceProviderId;
  modelId: string;
  displayName: string;
  baseUrl?: string;
  /** Never includes secrets. */
  credentialConfigured: boolean;
  /** Human-safe label only. */
  credentialLabel: string | null;
  configStatus: ConnectionConfigStatus;
  active: boolean;
  modelSelection?: ModelSelectionMode;
  modelStatus?: ModelAvailabilityStatus;
  recommendedModelId?: string | null;
  supportsModelDiscovery?: boolean;
};

export type IntelligenceStatusSnapshot = {
  active: IntelligenceConnectionView | null;
  connections: IntelligenceConnectionView[];
  local: {
    available: boolean;
    installed: boolean;
    warning: string | null;
    displayName: string;
  };
  cloud: {
    available: boolean;
  };
};

function humanDisplayName(c: LLMConnection): string {
  if (c.provider === "local") return "Local";
  if (c.provider === "personal-agent-cloud") return "Personal Agent Cloud";
  if (c.provider === "openai-compatible") return "Compatible con OpenAI";
  if (c.provider === "openai") return "OpenAI";
  if (c.provider === "anthropic") return "Anthropic";
  if (c.provider === "xai") return "xAI / Grok";
  if (c.provider === "gemini") return "Gemini";
  if (c.provider === "openrouter") return "OpenRouter";
  if (c.provider === "groq") return "Groq";
  return c.displayName;
}

function isConnectionConfigured(c: LLMConnection): boolean {
  if (c.provider === "local") {
    return isLocalLlmConfigured(createLocalModelManager());
  }
  if (c.provider === "personal-agent-cloud") {
    return (
      Boolean(resolvePersonalAgentCloudBaseUrl()) || isCloudDevAuthEnabled()
    );
  }
  return hasProviderApiKeyConfigured(c.provider);
}

export function toIntelligenceConnectionView(
  c: LLMConnection,
  selectedId: string,
): IntelligenceConnectionView {
  const configured = isConnectionConfigured(c);
  const active = c.id === selectedId;
  let configStatus: ConnectionConfigStatus = "not_configured";
  if (active && configured) configStatus = "active";
  else if (configured) configStatus = "configured";
  const supportsDiscovery =
    c.provider !== "local" && c.provider !== "openai-compatible"
      ? true
      : c.provider === "openai-compatible"
        ? Boolean(c.baseUrl)
        : false;
  // Local uses installed catalog, not remote discovery.
  const cache =
    configured && supportsDiscovery
      ? getCachedProviderModels(c.provider, { maxAgeMs: 24 * 60 * 60 * 1000 })
      : null;
  let modelStatus: ModelAvailabilityStatus | undefined;
  let recommendedModelId: string | null | undefined;
  if (c.provider === "local") {
    modelStatus = "discovery_unsupported";
  } else if (c.provider === "personal-agent-cloud") {
    const cloudDisc = {
      models: [] as ProviderModel[],
      discoveryStatus: "ok" as const,
      authStatus: "ok" as const,
      recommendedModelId: undefined as string | undefined,
    };
    // Prefer cache; else treat allowlisted cloud models as available offline.
    if (cache) {
      modelStatus = modelAvailabilityForConnection(c, {
        models: cache.models,
        recommendedModelId: cache.recommendedModelId,
        discoveryStatus: cache.discoveryStatus,
        authStatus: "ok",
      });
      recommendedModelId = cache.recommendedModelId || null;
    } else {
      modelStatus = isPersonalAgentCloudModel(c.modelId)
        ? "available"
        : "unavailable";
      recommendedModelId = "claude-sonnet-4-6";
      void cloudDisc;
    }
  } else if (!configured) {
    modelStatus = "not_discovered";
  } else if (cache) {
    modelStatus = modelAvailabilityForConnection(c, {
      models: cache.models,
      recommendedModelId: cache.recommendedModelId,
      discoveryStatus: cache.discoveryStatus,
      authStatus: "ok",
    });
    recommendedModelId = cache.recommendedModelId || null;
  } else {
    modelStatus = "not_discovered";
  }
  return {
    id: c.id,
    mode: c.mode,
    provider: c.provider,
    modelId: c.modelId === "__pending_discovery__" ? "" : c.modelId,
    displayName: humanDisplayName(c),
    baseUrl: c.baseUrl,
    credentialConfigured: configured && c.mode === "external",
    credentialLabel:
      configured && c.mode === "external" ? "API key configurada" : null,
    configStatus,
    active,
    modelSelection: c.modelSelection || (c.mode === "external" ? "recommended" : undefined),
    modelStatus,
    recommendedModelId,
    supportsModelDiscovery: c.provider === "local" ? false : supportsDiscovery || c.provider === "personal-agent-cloud",
  };
}

/** Ensure default external provider stubs exist for UX catalog. */
export function ensureExternalProviderStubs(): LLMConnection[] {
  const cfg = readIntelligenceConfig();
  const stubs: Array<{
    provider: Exclude<IntelligenceProviderId, "local" | "personal-agent-cloud">;
    modelId: string;
    displayName: string;
  }> = [
    { provider: "openai", modelId: "gpt-4.1-mini", displayName: "OpenAI" },
    {
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      displayName: "Anthropic",
    },
    { provider: "xai", modelId: "grok-4.6", displayName: "xAI / Grok" },
    {
      provider: "gemini",
      modelId: "gemini-3.6-flash",
      displayName: "Gemini",
    },
    {
      provider: "openrouter",
      modelId: "openai/gpt-4.1-mini",
      displayName: "OpenRouter",
    },
    { provider: "groq", modelId: "llama-3.3-70b-versatile", displayName: "Groq" },
    {
      provider: "openai-compatible",
      modelId: "default",
      displayName: "Compatible con OpenAI",
    },
  ];
  let changed = false;
  for (const s of stubs) {
    const id = `conn_ext_${s.provider}`;
    const existing = cfg.connections.find((c) => c.id === id);
    if (existing) {
      // Migrate outdated xAI defaults (PHASE 63.1).
      if (
        s.provider === "xai" &&
        (existing.modelId === "grok-2" ||
          existing.modelId === "grok-3" ||
          existing.modelId === "grok-4" ||
          existing.displayName === "xAI" ||
          existing.displayName === "XAI")
      ) {
        existing.modelId = "grok-4.6";
        existing.displayName = "xAI / Grok";
        changed = true;
      }
      continue;
    }
    cfg.connections.push({
      id,
      mode: "external",
      provider: s.provider,
      modelId: s.modelId,
      displayName: s.displayName,
      credentialRef: hasProviderApiKeyConfigured(s.provider)
        ? `cred_ref_${s.provider}`
        : undefined,
    });
    changed = true;
  }
  if (changed) writeIntelligenceConfig(cfg);
  return cfg.connections;
}

export function getIntelligenceStatusSnapshot(): IntelligenceStatusSnapshot {
  ensureExternalProviderStubs();
  const cfg = readIntelligenceConfig();
  // Si el selected apunta a una conexión borrada, cae a local.
  if (!cfg.connections.some((c) => c.id === cfg.selectedConnectionId)) {
    cfg.selectedConnectionId = "conn_local_default";
    if (!cfg.connections.some((c) => c.id === "conn_local_default")) {
      cfg.connections = [...DEFAULT_CONNECTIONS, ...cfg.connections];
    }
    writeIntelligenceConfig(cfg);
  }
  const views = cfg.connections.map((c) =>
    toIntelligenceConnectionView(c, cfg.selectedConnectionId),
  );
  const active = views.find((v) => v.active) || views[0] || null;
  const local = localAvailabilitySummary();
  return {
    active,
    connections: views,
    local: {
      ...local,
      displayName:
        cfg.connections.find((c) => c.provider === "local")?.displayName ||
        "Qwen3 4B",
    },
    cloud: {
      available:
        Boolean(resolvePersonalAgentCloudBaseUrl()) || isCloudDevAuthEnabled(),
    },
  };
}

/**
 * Disconnect BYOK: remove credential + clear credentialRef.
 * Does not delete conversation data. If this connection was active, switch to local.
 */
export function disconnectExternalProvider(
  providerId: string,
): IntelligenceConnectionView | null {
  if (
    providerId === "local" ||
    providerId === "personal-agent-cloud"
  ) {
    throw new Error("use_dedicated_disconnect");
  }
  clearPersistedProviderApiKey(providerId);
  clearProviderModelsCache(providerId);
  const cfg = readIntelligenceConfig();
  const connId = `conn_ext_${providerId}`;
  const idx = cfg.connections.findIndex((c) => c.id === connId);
  if (idx >= 0) {
    const prev = cfg.connections[idx]!;
    cfg.connections[idx] = {
      ...prev,
      credentialRef: undefined,
    };
  }
  if (cfg.selectedConnectionId === connId) {
    cfg.selectedConnectionId = "conn_local_default";
  }
  writeIntelligenceConfig(cfg);
  const next = cfg.connections.find((c) => c.id === connId);
  return next
    ? toIntelligenceConnectionView(next, cfg.selectedConnectionId)
    : null;
}

function cloudBaseUrl(): string {
  return resolvePersonalAgentCloudBaseUrl();
}

function providerForConnection(input: {
  connection: LLMConnection;
  localManager: LocalModelManager;
  localRuntime: LocalLLMRuntime;
  diagnostics?: SqliteDiagnosticsStore;
}): LLMProvider {
  const c = input.connection;
  if (c.provider === "local") {
    return createLocalProvider({
      manager: input.localManager,
      runtime: input.localRuntime,
      diagnostics: input.diagnostics,
    });
  }
  if (c.provider === "anthropic") {
    return createAnthropicProvider({ diagnostics: input.diagnostics });
  }
  if (c.provider === "personal-agent-cloud") {
    const base = cloudBaseUrl();
    if (!base && !isCloudDevAuthEnabled()) {
      throw new AgentDiagnosticError({
        message: userMessageForCloudAuth("CLOUD_AUTH_UNAVAILABLE"),
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        errorCode: "LLM_INVALID_CONFIGURATION",
        metadata: {
          provider: c.provider,
          model: c.modelId,
          cloudAuthCode: "CLOUD_AUTH_UNAVAILABLE",
        },
      });
    }
    // Lazy provider: auth resolved on first stream (async getCloudAuthClient).
    return {
      id: "personal-agent-cloud",
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: false,
      },
      async *stream(request: LLMRequest) {
        try {
          const { client, baseUrl } = await getCloudAuthClient();
          const identity = ensureLocalIdentity();
          const provider = createPersonalAgentCloudProvider({
            baseUrl,
            model: resolvePersonalAgentCloudModelId(c.modelId),
            auth: client,
            extraHeaders: {
              "X-Personal-Agent-User-Id": identity.user.id,
              "X-Personal-Agent-Agent-Id": identity.agent.id,
            },
            diagnostics: input.diagnostics,
          });
          for await (const ev of provider.stream(request)) {
            yield ev;
          }
        } catch (err) {
          if (err instanceof CloudAuthError) {
            throw new AgentDiagnosticError({
              message: userMessageForCloudAuth(err.code),
              component: "LLM_PROVIDER",
              stage: "LLM_REQUEST",
              errorCode:
                err.code === "CLOUD_AUTH_UNAVAILABLE"
                  ? "LLM_PROVIDER_UNAVAILABLE"
                  : "LLM_AUTH_FAILED",
              diagnosticId: request.diagnosticId,
              metadata: {
                provider: c.provider,
                model: c.modelId,
                cloudAuthCode: err.code,
              },
            });
          }
          throw err;
        }
      },
    };
  }
  const baseByProvider: Record<string, string | undefined> = {
    openai: "https://api.openai.com/v1",
    xai: "https://api.x.ai/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
  };
  const baseUrl = (c.baseUrl || baseByProvider[c.provider] || "").replace(/\/+$/, "");
  const apiKey = getEffectiveProviderApiKey(c.provider);
  if (!apiKey) {
    throw new AgentDiagnosticError({
      message: "missing_api_key",
      component: "LLM_PROVIDER",
      stage: "LLM_REQUEST",
      errorCode: "LLM_AUTH_FAILED",
      metadata: { provider: c.provider, model: c.modelId },
    });
  }
  return createOpenAiCompatibleProvider({
    providerId: c.provider,
    baseUrl,
    model: c.modelId,
    apiKey,
    diagnostics: input.diagnostics,
    ...(c.provider === "xai"
      ? {
          capabilities: {
            streaming: true,
            toolCalling: true,
            // Adapter actual: chat completions texto/tools; sin vision multipart.
            vision: false,
            structuredOutput: false,
          },
        }
      : {}),
  });
}

function withForcedModel(provider: LLMProvider, modelId: string): LLMProvider {
  return {
    id: provider.id,
    capabilities: provider.capabilities,
    stream(request: LLMRequest) {
      return provider.stream({ ...request, model: modelId });
    },
  };
}

export function createIntelligenceRouterProvider(input: {
  localManager: LocalModelManager;
  localRuntime: LocalLLMRuntime;
  diagnostics?: SqliteDiagnosticsStore;
}): LLMProvider {
  return {
    id: "intelligence-router",
    async *stream(request: LLMRequest) {
      const connection = getIntelligenceConnection(
        request.intelligenceConnectionId,
      );
      if (!connection) {
        throw new AgentDiagnosticError({
          message: "intelligence_not_configured",
          component: "LLM_PROVIDER",
          stage: "LLM_REQUEST",
          errorCode: "LLM_INVALID_CONFIGURATION",
        });
      }
      input.diagnostics?.record({
        diagnosticId: request.diagnosticId || "PA-UNKNOWN",
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        level: "INFO",
        event: "INTELLIGENCE_MODE_SELECTED",
        metadata: {
          mode: connection.mode,
          provider: connection.provider,
          model: connection.modelId,
        },
      });
      const provider = withForcedModel(
        providerForConnection({
          connection,
          localManager: input.localManager,
          localRuntime: input.localRuntime,
          diagnostics: input.diagnostics,
        }),
        connection.provider === "personal-agent-cloud"
          ? resolvePersonalAgentCloudModelId(connection.modelId)
          : connection.modelId || request.model || "claude-sonnet-4-6",
      );
      try {
        for await (const ev of provider.stream(request)) {
          yield ev;
        }
      } catch (err) {
        if (err instanceof AgentDiagnosticError) {
          throw new AgentDiagnosticError({
            message: err.message,
            component: err.component,
            stage: err.stage,
            errorCode: err.errorCode,
            diagnosticId: err.diagnosticId,
            httpStatus: err.httpStatus,
            metadata: {
              ...(err.metadata ?? {}),
              mode: connection.mode,
              provider: connection.provider,
              model: connection.modelId,
            },
          });
        }
        throw err;
      }
    },
  };
}

export function modeForConnection(conn: LLMConnection): IntelligenceMode {
  return conn.mode;
}

export function localAvailabilitySummary(): {
  available: boolean;
  installed: boolean;
  warning: string | null;
} {
  const manager = createLocalModelManager();
  const installed = isLocalLlmConfigured(manager);
  const hw = detectHardware();
  const rec = advisePrimaryModel(hw);
  const warning =
    rec.suitability === "not_recommended"
      ? "Este equipo tiene recursos limitados. El modelo local puede responder más lentamente."
      : null;
  return { available: true, installed, warning };
}
