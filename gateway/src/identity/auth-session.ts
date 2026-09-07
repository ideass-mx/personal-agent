/**
 * Revoke product AuthSession and kill bound WS connections.
 */
import { killConnectionsForAuthSession } from "../sessions/index.ts";
import {
  revokeAuthSessionRowsForDevice,
  revokeSession as revokeAuthSessionRow,
} from "./auth-session-store.ts";

export function revokeSession(sessionId: string): boolean {
  const ok = revokeAuthSessionRow(sessionId);
  if (ok) {
    killConnectionsForAuthSession(sessionId);
  }
  return ok;
}

export { isSessionActive } from "./auth-session-store.ts";

/**
 * Revoke all AuthSessions for a device and kill their WS connections.
 * Reuses revokeSession kill path per id; returns revoked session ids.
 */
export function revokeSessionsForDevice(deviceId: string): string[] {
  const ids = revokeAuthSessionRowsForDevice(deviceId);
  for (const id of ids) {
    killConnectionsForAuthSession(id);
  }
  return ids;
}
