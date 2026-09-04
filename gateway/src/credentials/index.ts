/**
 * Credential management (PHASE 59).
 * Capacidad transversal: Tool/MCP → CredentialManager → SecretStore.
 * No es Artifact, Memory, Pairing ni auth Android.
 */
export type {
  CredentialAccessContext,
  CredentialKind,
  CredentialManager,
  CredentialMetadata,
  CredentialRef,
  CredentialStatus,
  CreateCredentialInput,
  LlmSafeCredentialView,
  McpServerCredentialBinding,
  SecretStore,
} from "./types.ts";
export {
  assertSafeCredentialId,
  CREDENTIAL_ID_RE,
  CREDENTIAL_KINDS,
  isCredentialKind,
  isCredentialStatus,
  toLlmSafeCredentialView,
} from "./types.ts";
export {
  authorizeCredentialAccess,
  createCredentialManager,
  DefaultCredentialManager,
} from "./credential-manager.ts";
export {
  credentialsTableHasSecretColumn,
  getCredentialMetadata,
} from "./credential-store.ts";
export {
  isSensitiveKey,
  redactForLog,
  redactSecrets,
  redactString,
} from "./credential-redactor.ts";
export { resolveCredentialsRoot } from "./resolve-root.ts";
export { MemorySecretStore } from "./stores/memory-secret-store.ts";
export { EncryptedFileCredentialStore } from "./stores/encrypted-file-credential-store.ts";
export { WindowsCredentialStore } from "./stores/windows-credential-store.ts";

import { EncryptedFileCredentialStore } from "./stores/encrypted-file-credential-store.ts";
import { WindowsCredentialStore } from "./stores/windows-credential-store.ts";
import type { SecretStore } from "./types.ts";
import { resolveCredentialsRoot } from "./resolve-root.ts";

export type SecretStoreBackendId = "windows" | "encrypted_file" | "memory";

/**
 * Backend por plataforma: Windows Credential Manager en win32;
 * encrypted file en el resto (y tests vía inyección).
 */
export function createDefaultSecretStore(
  rootDir?: string,
): { store: SecretStore; backend: SecretStoreBackendId } {
  if (process.platform === "win32") {
    return { store: new WindowsCredentialStore(), backend: "windows" };
  }
  const root = rootDir ?? resolveCredentialsRoot();
  return {
    store: new EncryptedFileCredentialStore({ rootDir: root }),
    backend: "encrypted_file",
  };
}
