/**
 * Persist CloudSession secrets via SecretStore (never intelligence.json / localStorage).
 */
import type { CloudSession } from "./types.ts";
import type { SecretStore } from "../../credentials/types.ts";
import { assertSafeCredentialId } from "../../credentials/types.ts";

export const CLOUD_SESSION_CREDENTIAL_ID = "cred_pa_cloud_session";

export type CloudSessionStore = {
  load(): Promise<CloudSession | null>;
  save(session: CloudSession): Promise<void>;
  clear(): Promise<void>;
};

export function createCloudSessionStore(secrets: SecretStore): CloudSessionStore {
  const id = assertSafeCredentialId(CLOUD_SESSION_CREDENTIAL_ID);
  return {
    async load() {
      const raw = await secrets.get(id);
      if (!raw?.trim()) return null;
      try {
        const parsed = JSON.parse(raw) as CloudSession;
        if (
          !parsed?.sessionId ||
          !parsed.accessToken ||
          !parsed.deviceId ||
          !parsed.userId ||
          !parsed.expiresAt
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    async save(session) {
      await secrets.put(id, JSON.stringify(session));
    },
    async clear() {
      await secrets.delete(id);
    },
  };
}
