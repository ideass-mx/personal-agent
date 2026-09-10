/**
 * Catálogo de inteligencia para onboarding/settings.
 * PHASE 62: local / personal-agent-cloud / external (sin modo automático).
 * PHASE 63.2: validate vía GET /models (discovery); chat probe solo si hace falta.
 */
import {
  createFakeLocalRuntime,
  createLocalModelManager,
  createLocalProvider,
  isLocalLlmConfigured,
} from "../local-llm/index.ts";
import {
  applyModelDiscoveryToConnection,
  getIntelligenceConnection,
  listIntelligenceConnections,
  localAvailabilitySummary,
  modeForConnection,
  readIntelligenceConfig,
  resolvePersonalAgentCloudModelId,
  type IntelligenceProviderId,
} from "./intelligence.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { createOpenAiCompatibleProvider } from "./openai-compatible.ts";
import {
  createPersonalAgentCloudProvider,
  getCloudAuthClient,
  isCloudDevAuthEnabled,
  resolvePersonalAgentCloudBaseUrl,
} from "./cloud-auth/index.ts";
import { ensureLocalIdentity } from "../identity/ensure-local.ts";
import { getEffectiveProviderApiKey } from "../setup/llm-key.ts";
import type { LLMProvider } from "./types.ts";
import {
  discoverProviderModels,
  modelAvailabilityForConnection,
  resolveModelForConnectivityProbe,
  type ModelAvailabilityStatus,
  type ModelDiscoveryResult,
  type ProviderModel,
} from "./model-discovery.ts";

export type LlmProviderId = IntelligenceProviderId;

export type LlmProviderDescriptor = {
  id: LlmProviderId;
  mode: "local" | "personal-agent-cloud" | "external";
  name: string;
  available: boolean;
};

export type LlmConnectivityResult = {
  ok: true;
  provider: string;
  model: string;
  credentialConfigured: boolean;
  request: "success";
  sample?: string;
  discovery?: {
    status: ModelDiscoveryResult["discoveryStatus"];
    authStatus: ModelDiscoveryResult["authStatus"];
    modelStatus: ModelAvailabilityStatus;
    recommendedModelId?: string;
    models: ProviderModel[];
    modelSelection?: "recommended" | "specific";
  };
};

const CATALOG: readonly LlmProviderDescriptor[] = [
  { id: "local", mode: "local", name: "Modelo local", available: true },
  {
    id: "personal-agent-cloud",
    mode: "personal-agent-cloud",
    name: "Personal Agent Cloud",
    available: true,
  },
  { id: "openai", mode: "external", name: "OpenAI", available: true },
  { id: "anthropic", mode: "external", name: "Anthropic", available: true },
  { id: "xai", mode: "external", name: "xAI / Grok", available: true },
  { id: "gemini", mode: "external", name: "Gemini", available: true },
  { id: "openrouter", mode: "external", name: "OpenRouter", available: true },
  { id: "groq", mode: "external", name: "Groq", available: true },
  {
    id: "openai-compatible",
    mode: "external",
    name: "Compatible con OpenAI",
    available: true,
  },
] as const;

export function listProviders(): LlmProviderDescriptor[] {
  return CATALOG.map((p) => ({ ...p }));
}

export function getProviderDescriptor(id: string): LlmProviderDescriptor | null {
  const found = CATALOG.find((p) => p.id === id);
  return found ? { ...found } : null;
}

export function isProviderAvailable(id: string): boolean {
  return getProviderDescriptor(id)?.available === true;
}

export function createLlmProvider(id?: string): LLMProvider {
  if (id === "local") {
    const manager = createLocalModelManager();
    return createLocalProvider({
      manager,
      runtime: createFakeLocalRuntime({ reply: "OK" }),
    });
  }
  if (id === "anthropic") {
    return createAnthropicProvider();
  }
  if (id === "personal-agent-cloud") {
    const base = resolvePersonalAgentCloudBaseUrl();
    if (!base && !isCloudDevAuthEnabled()) throw new Error("cloud_unavailable");
    return {
      id: "personal-agent-cloud",
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: false,
      },
      async *stream(request) {
        const { client, baseUrl } = await getCloudAuthClient();
        const identity = ensureLocalIdentity();
        const selected = getIntelligenceConnection();
        const model = resolvePersonalAgentCloudModelId(
          selected?.provider === "personal-agent-cloud"
            ? selected.modelId
            : "claude-sonnet-4-6",
        );
        const provider = createPersonalAgentCloudProvider({
          baseUrl,
          model,
          auth: client,
          extraHeaders: {
            "X-Personal-Agent-User-Id": identity.user.id,
            "X-Personal-Agent-Agent-Id": identity.agent.id,
          },
        });
        for await (const ev of provider.stream(request)) {
          yield ev;
        }
      },
    };
  }
  if (
    id === "openai" ||
    id === "xai" ||
    id === "gemini" ||
    id === "openrouter" ||
    id === "groq" ||
    id === "openai-compatible"
  ) {
    const baseByProvider: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      xai: "https://api.x.ai/v1",
      gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
      openrouter: "https://openrouter.ai/api/v1",
      groq: "https://api.groq.com/openai/v1",
    };
    const selected = listIntelligenceConnections().find((c) => c.provider === id);
    const apiKey = getEffectiveProviderApiKey(id);
    return createOpenAiCompatibleProvider({
      providerId: id,
      baseUrl:
        selected?.baseUrl ||
        baseByProvider[id] ||
        process.env.PERSONAL_AGENT_EXTERNAL_BASE_URL ||
        "https://api.openai.com/v1",
      model: "default",
      apiKey,
    });
  }
  throw new Error(`provider_unavailable:${id || "unknown"}`);
}

export function isAnyLlmConfigured(): boolean {
  const cfg = readIntelligenceConfig();
  const selected = cfg.connections.find((c) => c.id === cfg.selectedConnectionId);
  if (!selected) return isLocalLlmConfigured(createLocalModelManager());
  if (selected.provider === "local") return localAvailabilitySummary().installed;
  if (selected.provider === "personal-agent-cloud") {
    return (
      Boolean(resolvePersonalAgentCloudBaseUrl()) || isCloudDevAuthEnabled()
    );
  }
  return Boolean(getEffectiveProviderApiKey(selected.provider));
}

/**
 * Valida conexión vía discovery (/models) cuando el proveedor lo soporta.
 * Un modelId retirado NO implica fallo de autenticación.
 * No duplica chat probe si /models ya autenticó.
 */
export async function verifyProviderConnectivity(
  providerId?: string,
): Promise<LlmConnectivityResult> {
  const selected =
    listIntelligenceConnections().find((c) => c.provider === providerId) ||
    getIntelligenceConnection();
  if (!selected) throw new Error("provider_unavailable");

  let discovery: ModelDiscoveryResult | null = null;
  let connection = selected;

  if (selected.provider === "local") {
    const provider = createLlmProvider("local");
    let text = "";
    for await (const ev of provider.stream({
      model: selected.modelId,
      messages: [
        { role: "user", content: "Responde únicamente con la palabra OK." },
      ],
    })) {
      if (ev.type === "text_delta") text += ev.text;
    }
    if (!text.trim()) throw new Error("empty_llm_response");
    return {
      ok: true,
      provider: "local",
      model: selected.modelId,
      credentialConfigured: false,
      request: "success",
      sample: text.trim().slice(0, 32),
    };
  }

  discovery = await discoverProviderModels({
    provider: selected.provider,
    connection: selected,
    useCache: false,
  });
  if (discovery.authStatus === "failed") {
    throw Object.assign(new Error("invalid_credential"), {
      errorCode: discovery.errorCode || "PROVIDER_AUTH_FAILED",
    });
  }

  if (discovery.discoveryStatus === "ok") {
    connection = applyModelDiscoveryToConnection(selected.id, discovery);
    const modelStatus = modelAvailabilityForConnection(connection, discovery);
    return {
      ok: true,
      provider: connection.provider,
      model:
        connection.modelId === "__pending_discovery__"
          ? discovery.recommendedModelId ||
            discovery.models[0]?.id ||
            ""
          : connection.modelId,
      credentialConfigured: true,
      request: "success",
      discovery: {
        status: discovery.discoveryStatus,
        authStatus: discovery.authStatus,
        modelStatus,
        recommendedModelId: discovery.recommendedModelId || undefined,
        models: discovery.models,
        modelSelection: connection.modelSelection || "recommended",
      },
    };
  }

  // Discovery falló sin auth failed: conexión permanece; no chat probe obligatorio.
  if (discovery.authStatus === "ok") {
    return {
      ok: true,
      provider: connection.provider,
      model:
        connection.modelId === "__pending_discovery__"
          ? ""
          : connection.modelId,
      credentialConfigured: true,
      request: "success",
      discovery: {
        status: discovery.discoveryStatus,
        authStatus: discovery.authStatus,
        modelStatus: "not_discovered",
        recommendedModelId: discovery.recommendedModelId || undefined,
        models: discovery.models,
        modelSelection: connection.modelSelection || "recommended",
      },
    };
  }

  // auth unknown + discovery failed (p.ej. openai-compatible sin /models):
  // conservar probe de chat como fallback de validación.
  const probeModel = resolveModelForConnectivityProbe(connection, discovery);
  const provider = createLlmProvider(connection.provider);
  let text = "";
  for await (const ev of provider.stream({
    model: probeModel,
    messages: [{ role: "user", content: "Responde únicamente con la palabra OK." }],
  })) {
    if (ev.type === "text_delta") text += ev.text;
  }
  if (!text.trim()) throw new Error("empty_llm_response");
  return {
    ok: true,
    provider: connection.provider,
    model:
      connection.modelId === "__pending_discovery__"
        ? probeModel
        : connection.modelId,
    credentialConfigured: true,
    request: "success",
    sample: text.trim().slice(0, 32),
    discovery: {
      status: discovery.discoveryStatus,
      authStatus: discovery.authStatus,
      modelStatus: modelAvailabilityForConnection(connection, discovery),
      recommendedModelId: discovery.recommendedModelId || undefined,
      models: discovery.models,
      modelSelection: connection.modelSelection || "recommended",
    },
  };
}

export function getActiveMode():
  | "local"
  | "personal-agent-cloud"
  | "external"
  | null {
  const conn = getIntelligenceConnection();
  if (!conn) return null;
  return modeForConnection(conn);
}
