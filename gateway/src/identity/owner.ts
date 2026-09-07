/**
 * Owner authority: User that owns PersonalAgent.
 * Not RBAC. Not authKind===install synonym.
 */
import { getPersonalAgentById } from "./store.ts";
import type { UserContext } from "./types.ts";

export type OwnerCheckResult =
  | { ok: true; userId: string; agentId: string }
  | { ok: false; code: "owner_mismatch" | "agent_not_found"; message: string };

/**
 * True when UserContext is the owner of the PersonalAgent it references.
 * Server-derived context only — does not trust client claims.
 */
export function isAgentOwner(ctx: UserContext): boolean {
  return assertAgentOwner(ctx).ok;
}

/** Fail-closed ownership check for administrative operations. */
export function assertAgentOwner(ctx: UserContext): OwnerCheckResult {
  const agent = getPersonalAgentById(ctx.agentId);
  if (!agent) {
    return {
      ok: false,
      code: "agent_not_found",
      message: "PersonalAgent desconocido.",
    };
  }
  if (agent.userId !== ctx.userId) {
    return {
      ok: false,
      code: "owner_mismatch",
      message: "La sesión no pertenece al propietario del PersonalAgent.",
    };
  }
  return { ok: true, userId: ctx.userId, agentId: ctx.agentId };
}

/**
 * Host install transport (Desktop / HUB_TOKEN) is install_compat.
 * This is NOT "owner" — ownership is assertAgentOwner.
 * Browser/device sessions share owner identity for product access but are not
 * the host install credential used for setup/pairing.
 */
export function isInstallCompatTransport(ctx: UserContext): boolean {
  return ctx.authKind === "install_compat";
}
