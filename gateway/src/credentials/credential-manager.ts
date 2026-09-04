/**
 * CredentialManager — metadata (SQLite) + SecretStore.
 * No conoce AgentRuntime, Android, Artifact ni protocolo MCP.
 */
import { randomUUID } from "node:crypto";
import {
  deleteCredentialMetadata,
  getCredentialMetadata,
  insertCredentialMetadata,
  updateCredentialStatus,
} from "./credential-store.ts";
import { redactForLog } from "./credential-redactor.ts";
import type {
  CredentialAccessContext,
  CredentialManager,
  CredentialMetadata,
  CredentialRef,
  CreateCredentialInput,
  SecretStore,
} from "./types.ts";
import { assertSafeCredentialId } from "./types.ts";

function isExpired(meta: CredentialMetadata, now = Date.now()): boolean {
  if (!meta.expiresAt) return false;
  const t = Date.parse(meta.expiresAt);
  if (Number.isNaN(t)) return false;
  return t <= now;
}

/**
 * Autorización conservadora por binding integration/server.
 * TrustedDevice ≠ credential access.
 */
export function authorizeCredentialAccess(
  meta: CredentialMetadata,
  context: CredentialAccessContext,
): boolean {
  if (meta.status === "REVOKED" || meta.status === "EXPIRED") return false;
  if (isExpired(meta)) return false;
  if (meta.status !== "ACTIVE") return false;

  if (meta.serverId) {
    if (!context.serverId || context.serverId !== meta.serverId) {
      return false;
    }
  }
  if (meta.integrationId) {
    if (
      !context.integrationId ||
      context.integrationId !== meta.integrationId
    ) {
      return false;
    }
  }
  return true;
}

export class DefaultCredentialManager implements CredentialManager {
  constructor(private readonly secrets: SecretStore) {}

  async create(
    input: CreateCredentialInput,
    secret: string,
  ): Promise<CredentialRef> {
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("CredentialManager.create: secret vacío");
    }
    const rawId =
      input.id?.trim() || `cred_${randomUUID().replace(/-/g, "")}`;
    const id = assertSafeCredentialId(rawId);

    insertCredentialMetadata({
      ...input,
      id,
      status: "ACTIVE",
    });

    try {
      await this.secrets.put(id, secret);
    } catch (err) {
      try {
        deleteCredentialMetadata(id);
      } catch {
        /* ignore */
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `CredentialManager.create: SecretStore falló: ${redactForLog(msg)}`,
      );
    }

    return { credentialId: id, purpose: input.provider };
  }

  async getMetadata(
    credentialId: string,
  ): Promise<CredentialMetadata | null> {
    const meta = getCredentialMetadata(credentialId);
    if (!meta) return null;
    if (meta.status === "ACTIVE" && isExpired(meta)) {
      try {
        updateCredentialStatus(meta.id, "EXPIRED");
      } catch {
        /* ignore */
      }
      return { ...meta, status: "EXPIRED" };
    }
    return meta;
  }

  async getSecret(
    credentialId: string,
    context: CredentialAccessContext,
  ): Promise<string | null> {
    const meta = await this.getMetadata(credentialId);
    if (!meta) return null;
    if (!authorizeCredentialAccess(meta, context)) {
      return null;
    }
    return this.secrets.get(meta.id);
  }

  async revoke(credentialId: string): Promise<void> {
    const meta = getCredentialMetadata(credentialId);
    if (!meta) throw new Error("Credential no encontrada");
    updateCredentialStatus(meta.id, "REVOKED");
  }

  async delete(credentialId: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    try {
      await this.secrets.delete(id);
    } finally {
      deleteCredentialMetadata(id);
    }
  }
}

export function createCredentialManager(
  secrets: SecretStore,
): CredentialManager {
  return new DefaultCredentialManager(secrets);
}
