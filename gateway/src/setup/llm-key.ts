/**
 * Persistencia de claves LLM por provider (fuera de setup_state).
 * No logs del secreto. Preferir credentials/llm/{id}.api_key;
 * migra legacy credentials/anthropic.api_key.
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
  for (const file of [providerKeyFile("anthropic"), legacyAnthropicFile()]) {
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

/** Env (Desktop inject) gana para Anthropic si no es placeholder; si no, fichero persistido. */
export function getEffectiveProviderApiKey(providerId: string): string {
  if (providerId === "anthropic") {
    const fromEnv = process.env.ANTHROPIC_API_KEY?.trim() || "";
    if (fromEnv && !isPlaceholderKey(fromEnv)) return fromEnv;
    const fromFile = readPersistedProviderApiKey("anthropic");
    if (fromFile) return fromFile;
    const fromConfig = config.anthropicApiKey || "";
    if (fromConfig && !isPlaceholderKey(fromConfig)) return fromConfig;
    return fromEnv || fromConfig || "";
  }
  return readPersistedProviderApiKey(providerId) || "";
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
