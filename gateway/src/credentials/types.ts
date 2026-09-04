/**
 * Credential types — metadata vs secret; no MCP/Runtime coupling.
 * Credential ≠ Artifact ≠ Memory ≠ Android auth.
 */
export type CredentialKind =
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "oauth_token";

export type CredentialStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

/** Opaque reference — never contains the secret value. */
export type CredentialRef = {
  readonly credentialId: string;
  readonly purpose?: string;
};

export type CredentialMetadata = {
  readonly id: string;
  readonly name: string;
  readonly kind: CredentialKind;
  readonly provider?: string;
  readonly scope?: readonly string[];
  readonly integrationId?: string;
  readonly serverId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly status: CredentialStatus;
};

/** Vista segura para LLM / UI — sin valor secreto. */
export type LlmSafeCredentialView = {
  readonly credentialId: string;
  readonly name: string;
  readonly provider?: string;
  readonly status: CredentialStatus;
};

export type CredentialAccessContext = {
  readonly integrationId?: string;
  readonly serverId?: string;
  readonly toolName?: string;
  readonly reason?: string;
};

/** Binding interno Gateway ↔ MCP server (no protocolo MCP). */
export type McpServerCredentialBinding = {
  readonly serverId: string;
  readonly credentialId: string;
};

export type CreateCredentialInput = {
  readonly name: string;
  readonly kind: CredentialKind;
  readonly provider?: string;
  readonly scope?: readonly string[];
  readonly integrationId?: string;
  readonly serverId?: string;
  readonly expiresAt?: string;
  /** Si se omite, se genera `cred_<uuid>`. */
  readonly id?: string;
};

export interface SecretStore {
  put(credentialId: string, secret: string): Promise<void>;
  get(credentialId: string): Promise<string | null>;
  delete(credentialId: string): Promise<void>;
}

export interface CredentialManager {
  create(
    input: CreateCredentialInput,
    secret: string,
  ): Promise<CredentialRef>;
  getMetadata(credentialId: string): Promise<CredentialMetadata | null>;
  getSecret(
    credentialId: string,
    context: CredentialAccessContext,
  ): Promise<string | null>;
  revoke(credentialId: string): Promise<void>;
  delete(credentialId: string): Promise<void>;
}

/** IDs seguros: sin path traversal / SQL injection vía id. */
export const CREDENTIAL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function assertSafeCredentialId(id: string): string {
  const trimmed = id.trim();
  if (!CREDENTIAL_ID_RE.test(trimmed)) {
    throw new Error(`Credential: id inválido: ${JSON.stringify(id)}`);
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Credential: id con path traversal rechazado");
  }
  return trimmed;
}

export function toLlmSafeCredentialView(
  meta: CredentialMetadata,
): LlmSafeCredentialView {
  return {
    credentialId: meta.id,
    name: meta.name,
    provider: meta.provider,
    status: meta.status,
  };
}

export const CREDENTIAL_KINDS: readonly CredentialKind[] = [
  "api_key",
  "bearer_token",
  "basic_auth",
  "oauth_token",
];

export function isCredentialKind(value: string): value is CredentialKind {
  return (CREDENTIAL_KINDS as readonly string[]).includes(value);
}

export function isCredentialStatus(value: string): value is CredentialStatus {
  return value === "ACTIVE" || value === "REVOKED" || value === "EXPIRED";
}
