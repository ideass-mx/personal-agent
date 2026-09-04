/**
 * SecretStore en memoria — solo tests.
 */
import type { SecretStore } from "../types.ts";
import { assertSafeCredentialId } from "../types.ts";

export class MemorySecretStore implements SecretStore {
  private readonly map = new Map<string, string>();

  async put(credentialId: string, secret: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("SecretStore.put: secret vacío");
    }
    this.map.set(id, secret);
  }

  async get(credentialId: string): Promise<string | null> {
    const id = assertSafeCredentialId(credentialId);
    return this.map.get(id) ?? null;
  }

  async delete(credentialId: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    this.map.delete(id);
  }
}
