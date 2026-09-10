/**
 * Persistencia de claves LLM por provider (fuera de setup_state).
 * Fuente de verdad: Credential Store (ficheros credentials/llm/{id}.api_key).
 *
 * Variables de entorno SOLO con PERSONAL_AGENT_DEV_PROVIDER_ENV=1
 * (desarrollo / tests / CI). Nunca sobrescriben silenciosamente en producción.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

function credentialsDir(): string {
  const fromEnv = process.env.PERSONAL_AGENT_CREDENTIALS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(path.dirname(path.resolve(config.dbFile)), "..", "credentials");
}

function llmDir(): string {
  return path.join(credentialsDir(), "llm");
}

function providerKeyFile(providerId: string): string {
  const safe = providerId.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  return path.join(llmDir(), `${safe}.api_key`);
}

function legacyAnthropicFile(): string {
  return path.join(credentialsDir(), "anthropic.api_key");
}

function readKeyFile(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function readPersistedProviderApiKey(providerId: string): string | null {
  const primary = readKeyFile(providerKeyFile(providerId));
  if (primary) return primary;
  if (providerId === "anthropic") {
    return readKeyFile(legacyAnthropicFile());
  }
  return null;
}

export function writePersistedProviderApiKey(
  providerId: string,
  apiKey: string,
): void {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    throw new Error("api_key_required");
  }
  const dir = llmDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = providerKeyFile(providerId);
  fs.writeFileSync(file, trimmed, "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows may ignore */
  }
  // Keep legacy path in sync for Anthropic (Desktop/scripts antiguos).
  if (providerId === "anthropic") {
    const legacy = legacyAnthropicFile();
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, trimmed, "utf8");
    try {
      fs.chmodSync(legacy, 0o600);
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated use readPersistedProviderApiKey("anthropic") */
export function readPersistedAnthropicApiKey(): string | null {
  return readPersistedProviderApiKey("anthropic");
}

/** @deprecated use writePersistedProviderApiKey("anthropic", …) */
export function writePersistedAnthropicApiKey(apiKey: string): void {
  writePersistedProviderApiKey("anthropic", apiKey);
}

export function clearPersistedAnthropicApiKey(): void {
  clearPersistedProviderApiKey("anthropic");
}

export function clearPersistedProviderApiKey(providerId: string): void {
  const files = [providerKeyFile(providerId)];
  if (providerId === "anthropic") files.push(legacyAnthropicFile());
  for (const file of files) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
}

function isPlaceholderKey(key: string): boolean {
  if (key === "sk-ant-pending-setup") return true;
  if (key.startsWith("sk-ant-test-")) return true;
  if (key.startsWith("sk-ant-ci-")) return true;
  return false;
}

/** DEV/TEST/CI only — never silent production fallback. */
export function isDevProviderEnvEnabled(): boolean {
  return process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV === "1";
}

const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
};

/**
 * Credential Store primero.
 * ENV / config.anthropicApiKey solo si PERSONAL_AGENT_DEV_PROVIDER_ENV=1.
 */
export function getEffectiveProviderApiKey(providerId: string): string {
  const fromFile = readPersistedProviderApiKey(providerId);
  if (fromFile && !isPlaceholderKey(fromFile)) return fromFile;

  if (!isDevProviderEnvEnabled()) return "";

  const envName = PROVIDER_ENV_KEYS[providerId];
  if (envName) {
    const fromEnv = process.env[envName]?.trim() || "";
    if (fromEnv && !isPlaceholderKey(fromEnv)) return fromEnv;
  }
  if (providerId === "anthropic") {
    const fromConfig = config.anthropicApiKey || "";
    if (fromConfig && !isPlaceholderKey(fromConfig)) return fromConfig;
  }
  return "";
}

/** @deprecated */
export function getEffectiveAnthropicApiKey(): string {
  return getEffectiveProviderApiKey("anthropic");
}

export function hasProviderApiKeyConfigured(providerId: string): boolean {
  const key = getEffectiveProviderApiKey(providerId);
  if (!key || key.length < 16) return false;
  if (isPlaceholderKey(key)) return false;
  return true;
}

/** @deprecated */
export function hasAnthropicApiKeyConfigured(): boolean {
  return hasProviderApiKeyConfigured("anthropic");
}
