/**
 * PHASE 57.2 — Identity Foundation types.
 *
 * Distinción crítica:
 * - PersonalAgent.id = identidad de instalación/producto (puede adoptar PERSONAL_AGENT_ID).
 * - AgentDefinition.id = identidad lógica del runtime LLM (p. ej. "personal-assistant").
 * - HUB_TOKEN = install_compat (credencial legacy), NUNCA userId.
 */

/** Stable local-first user id. Not Windows USERNAME / SID / hostname. */
export const LOCAL_USER_ID = "local-user";

/** Default PersonalAgent id when PERSONAL_AGENT_ID is unset. */
export const DEFAULT_PERSONAL_AGENT_ID = "personal-agent";

export const DEFAULT_USER_DISPLAY_NAME = "Usuario local";
export const DEFAULT_PERSONAL_AGENT_NAME = "Personal Agent";

export type PersonalAgentStatus = "ACTIVE" | "DISABLED";

export type User = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
};

export type PersonalAgent = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly status: PersonalAgentStatus;
  readonly createdAt: string;
};

/**
 * How the caller proved identity to Gateway.
 * `install_compat` = HUB_TOKEN / legacy install — not a User identity.
 */
export type AuthKindCompat = "install_compat" | "device" | "browser";

/**
 * Explicit identity boundary for Gateway operations.
 * Optional fields stay optional until Sessions/Nodes exist fully.
 */
export type UserContext = {
  readonly userId: string;
  readonly agentId: string;
  readonly deviceId?: string;
  readonly nodeId?: string;
  readonly sessionId?: string;
  readonly authKind?: AuthKindCompat;
  readonly permissions?: readonly string[];
};

export type EnsureLocalIdentityResult = {
  readonly user: User;
  readonly agent: PersonalAgent;
  /** True if either row was inserted this call. */
  readonly created: boolean;
};
