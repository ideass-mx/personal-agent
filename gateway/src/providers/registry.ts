/**
 * Catálogo de inteligencia para onboarding/settings.
 * PHASE 62: local / personal-agent-cloud / external (sin modo automático).
 */
import {
  createFakeLocalRuntime,
  createLocalModelManager,
  createLocalProvider,
  isLocalLlmConfigured,
} from "../local-llm/index.ts";
import {
  getIntelligenceConnection,
  listIntelligenceConnections,
  localAvailabilitySummary,
  modeForConnection,
  readIntelligenceConfig,
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
        const provider = createPersonalAgentCloudProvider({
          baseUrl,
          model: "pa-cloud-default",
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
    id === "openrouter" ||
    id === "groq" ||
    id === "openai-compatible"
  ) {
    const baseByProvider: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      xai: "https://api.x.ai/v1",
      openrouter: "https://openrouter.ai/api/v1",
      groq: "https://api.groq.com/openai/v1",
    };
    const apiKey = getEffectiveProviderApiKey(id);
    return createOpenAiCompatibleProvider({
      providerId: id,
      baseUrl: baseByProvider[id] || process.env.PERSONAL_AGENT_EXTERNAL_BASE_URL || "https://api.openai.com/v1",
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

export async function verifyProviderConnectivity(
  providerId?: string,
): Promise<LlmConnectivityResult> {
  const selected =
    listIntelligenceConnections().find((c) => c.provider === providerId) ||
    getIntelligenceConnection();
  if (!selected) throw new Error("provider_unavailable");
  const provider = createLlmProvider(selected.provider);
  let text = "";
  for await (const ev of provider.stream({
    model: selected.modelId,
    messages: [{ role: "user", content: "Responde únicamente con la palabra OK." }],
  })) {
    if (ev.type === "text_delta") text += ev.text;
  }
  const sample = text.trim();
  if (!sample) throw new Error("empty_llm_response");
  return {
    ok: true,
    provider: selected.provider,
    model: selected.modelId,
    credentialConfigured: selected.provider !== "local",
    request: "success",
    sample: sample.slice(0, 32),
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
