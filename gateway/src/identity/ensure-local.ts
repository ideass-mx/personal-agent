/**
 * Create or reconcile the single local-first User + PersonalAgent for this installation.
 * Idempotent across Gateway restarts. Does not use OS username/SID/hostname as ids.
 */
import { config } from "../config.ts";
import {
  annotateTrustedDevicesOwnership,
  getPersonalAgentById,
  getPersonalAgentByUserId,
  getUserById,
  insertPersonalAgent,
  insertUser,
} from "./store.ts";
import {
  DEFAULT_PERSONAL_AGENT_ID,
  DEFAULT_PERSONAL_AGENT_NAME,
  DEFAULT_USER_DISPLAY_NAME,
  LOCAL_USER_ID,
  type EnsureLocalIdentityResult,
  type PersonalAgent,
  type User,
} from "./types.ts";

function resolvePersonalAgentId(): string {
  const fromConfig = config.agentId?.trim();
  if (fromConfig) return fromConfig;
  return DEFAULT_PERSONAL_AGENT_ID;
}

/**
 * Ensures local identity rows exist and annotates existing trusted devices.
 * Safe to call on every Gateway boot.
 */
export function ensureLocalIdentity(): EnsureLocalIdentityResult {
  let created = false;
  let user: User | null = getUserById(LOCAL_USER_ID);
  if (!user) {
    user = insertUser({ id: LOCAL_USER_ID, name: DEFAULT_USER_DISPLAY_NAME });
    created = true;
  }

  const desiredAgentId = resolvePersonalAgentId();
  let agent: PersonalAgent | null =
    getPersonalAgentById(desiredAgentId) ?? getPersonalAgentByUserId(user.id);

  if (!agent) {
    agent = insertPersonalAgent({
      id: desiredAgentId,
      userId: user.id,
      name: DEFAULT_PERSONAL_AGENT_NAME,
      status: "ACTIVE",
    });
    created = true;
  } else if (agent.userId !== user.id) {
    // Should not happen in single-user install; fail closed rather than reassign.
    throw new Error(
      `identity_agent_owner_mismatch: agent=${agent.id} expectedUser=${user.id}`,
    );
  }

  annotateTrustedDevicesOwnership({
    userId: user.id,
    agentId: agent.id,
  });

  return { user, agent, created };
}
