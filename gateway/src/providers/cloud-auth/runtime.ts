/**
 * Shared Cloud Auth wiring for Gateway (intelligence + setup HTTP).
 */
import { createDefaultSecretStore } from "../../credentials/index.ts";
import { createCloudAuthClient, type CloudAuthClient } from "./client.ts";
import { createHttpCloudAuthTransport } from "./http-transport.ts";
import { createCloudSessionStore } from "./session-store.ts";
import type { CloudAuthTransport } from "./types.ts";
import { CloudAuthError } from "./types.ts";

/** Production default endpoint (override with PERSONAL_AGENT_CLOUD_BASE_URL). */
export const PERSONAL_AGENT_CLOUD_PRODUCTION_BASE_URL =
  "https://cloud.personal-agent.app";

let cachedClient: CloudAuthClient | null = null;
let cachedBase: string | null = null;

export function resolvePersonalAgentCloudBaseUrl(): string {
  const raw = process.env.PERSONAL_AGENT_CLOUD_BASE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    return PERSONAL_AGENT_CLOUD_PRODUCTION_BASE_URL;
  }
  return "";
}

export function isCloudDevAuthEnabled(): boolean {
  return (
    process.env.PERSONAL_AGENT_CLOUD_DEV_AUTH === "1" &&
    Boolean(process.env.PERSONAL_AGENT_CLOUD_SESSION_TOKEN?.trim())
  );
}

export function clearCloudAuthClientCache(): void {
  cachedClient = null;
  cachedBase = null;
}

/**
 * Lazy singleton CloudAuthClient for the process.
 * Transport is null when base URL missing and not using DEV token.
 */
export async function getCloudAuthClient(): Promise<{
  client: CloudAuthClient;
  baseUrl: string;
}> {
  const base = resolvePersonalAgentCloudBaseUrl();
  const usingDev = isCloudDevAuthEnabled();
  if (!base && !usingDev) {
    throw new CloudAuthError(
      "CLOUD_AUTH_UNAVAILABLE",
      "cloud base url not configured",
    );
  }
  if (cachedClient && cachedBase === base) {
    return { client: cachedClient, baseUrl: base || PERSONAL_AGENT_CLOUD_PRODUCTION_BASE_URL };
  }

  const { store } = createDefaultSecretStore();
  const sessionStore = createCloudSessionStore(store);
  let transport: CloudAuthTransport | null = null;
  if (base && !usingDev) {
    transport = await createHttpCloudAuthTransport({ baseUrl: base });
  }

  cachedClient = createCloudAuthClient({
    transport,
    sessionStore,
    devSessionToken: usingDev
      ? process.env.PERSONAL_AGENT_CLOUD_SESSION_TOKEN
      : null,
  });
  cachedBase = base;
  return {
    client: cachedClient,
    baseUrl: base || PERSONAL_AGENT_CLOUD_PRODUCTION_BASE_URL,
  };
}

/** For tests: inject client without HTTP. */
export function setCloudAuthClientForTests(
  client: CloudAuthClient | null,
  baseUrl = "https://cloud.test.example",
): void {
  cachedClient = client;
  cachedBase = client ? baseUrl : null;
}
