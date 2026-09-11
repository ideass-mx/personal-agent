/**
 * Selección de proveedor LLM (local por defecto en instalación nueva).
 * Sin fallback silencioso Local → Anthropic.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import {
  hasProviderApiKeyConfigured,
  getEffectiveAnthropicApiKey,
} from "../setup/llm-key.ts";
import { getSetupState } from "../setup/setup-store.ts";
import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
} from "./catalog.ts";
import type { LocalModelManager } from "./manager.ts";
import { resolveProductDataRoot } from "./storage.ts";

export type LlmProviderKind = "local" | "anthropic";

export type EffectiveLlmSelection = {
  provider: LlmProviderKind;
  modelId: string;
  /** true si se puede conversar ahora. */
  ready: boolean;
  reason: string;
};

function preferenceFile(): string {
  return path.join(resolveProductDataRoot(), "config", "llm-preference.json");
}

export type LlmPreference = {
  provider: LlmProviderKind;
  modelId?: string;
  variantId?: string;
};

export function readLlmPreference(): LlmPreference | null {
  const file = preferenceFile();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LlmPreference;
    if (raw.provider !== "local" && raw.provider !== "anthropic") return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeLlmPreference(pref: LlmPreference): void {
  const file = preferenceFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pref, null, 2), "utf8");
}

/**
 * Nueva instalación: preferir local.
 * Si el usuario configuró Anthropic explícitamente en setup_state, respetarlo.
 * Nunca cambiar a Anthropic solo porque falta el modelo local.
 */
export function resolveLlmSelection(
  manager: LocalModelManager,
): EffectiveLlmSelection {
  const pref = readLlmPreference();
  const setup = (() => {
    try {
      return getSetupState();
    } catch {
      return null;
    }
  })();

  const setupProvider = setup?.llmProvider?.toLowerCase() || null;

  // Preferencia explícita en disco
  if (pref?.provider === "anthropic") {
    const ok = hasProviderApiKeyConfigured("anthropic");
    return {
      provider: "anthropic",
      modelId: config.anthropicApiKey ? "claude" : "claude-sonnet-4-6",
      ready: ok,
      reason: ok ? "anthropic_configured" : "anthropic_key_missing",
    };
  }
  if (pref?.provider === "local") {
    const active = manager.getActive();
    return {
      provider: "local",
      modelId: active?.modelId || pref.modelId || DEFAULT_LOCAL_MODEL_ID,
      ready: Boolean(active),
      reason: active ? "local_active" : "local_model_missing",
    };
  }

  // setup_state
  if (setupProvider === "anthropic") {
    const ok = hasProviderApiKeyConfigured("anthropic");
    return {
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      ready: ok,
      reason: ok ? "setup_anthropic" : "anthropic_key_missing",
    };
  }

  // Default producto: local
  const active = manager.getActive();
  if (active) {
    return {
      provider: "local",
      modelId: active.modelId,
      ready: true,
      reason: "local_default_installed",
    };
  }

  // Env force anthropic (dev)
  if (process.env.PERSONAL_AGENT_LLM_PROVIDER === "anthropic") {
    const ok = Boolean(getEffectiveAnthropicApiKey());
    return {
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      ready: ok,
      reason: ok ? "env_anthropic" : "anthropic_key_missing",
    };
  }

  return {
    provider: "local",
    modelId: DEFAULT_LOCAL_MODEL_ID,
    ready: false,
    reason: "local_default_not_installed",
  };
}

export function isLocalLlmConfigured(manager: LocalModelManager): boolean {
  if (manager.getActive()) return true;
  // Modelo en disco cuenta como instalado aunque aún no esté marcado active.
  return manager.isInstalled(DEFAULT_LOCAL_MODEL_ID);
}

export function defaultLocalPreference(): LlmPreference {
  return {
    provider: "local",
    modelId: DEFAULT_LOCAL_MODEL_ID,
    variantId: DEFAULT_LOCAL_VARIANT_ID,
  };
}
