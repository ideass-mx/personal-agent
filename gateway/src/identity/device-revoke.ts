/**
 * Trusted Device revocation with owner authority + AuthSession cascade.
 */
import {
  revokeTrustedDevice as revokeTrustedDeviceRow,
  getTrustedDeviceOwnership,
} from "../pairing/store.ts";
import { killConnectionsForDevice } from "../sessions/index.ts";
import { revokeSessionsForDevice } from "./auth-session.ts";
import { assertAgentOwner } from "./owner.ts";
import type { UserContext } from "./types.ts";

export type RevokeTrustedDeviceResult =
  | {
      ok: true;
      status: "REVOKED";
      alreadyRevoked: boolean;
      sessionsRevoked: string[];
      connectionsKilled: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

/**
 * Owner-gated device revoke:
 * Device REVOKED → AuthSessions revoked → WS killed.
 * Does not revoke User or PersonalAgent.
 */
export function revokeTrustedDevice(
  deviceId: string,
  caller: UserContext,
): RevokeTrustedDeviceResult {
  const ownership = assertAgentOwner(caller);
  if (!ownership.ok) {
    return {
      ok: false,
      code: ownership.code,
      message: ownership.message,
    };
  }

  const bound = getTrustedDeviceOwnership(deviceId);
  if (bound) {
    if (
      (bound.userId && bound.userId !== caller.userId) ||
      (bound.agentId && bound.agentId !== caller.agentId)
    ) {
      return {
        ok: false,
        code: "owner_mismatch",
        message: "El dispositivo no pertenece a este PersonalAgent.",
      };
    }
  }

  const device = revokeTrustedDeviceRow(deviceId);
  if (!device.ok) {
    return device;
  }

  const sessionsRevoked = revokeSessionsForDevice(deviceId);
  const connectionsKilled = killConnectionsForDevice(deviceId);

  return {
    ok: true,
    status: "REVOKED",
    alreadyRevoked: device.alreadyRevoked,
    sessionsRevoked,
    connectionsKilled,
  };
}
