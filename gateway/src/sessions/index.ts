import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { ConfirmationWaiter } from "./confirmation-waiter.ts";

export interface Session {
  /** Identidad opaca de esta conexión WS (binding de confirmaciones). */
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  deviceId?: string;
  deviceName?: string;
  /**
   * Cómo se autenticó esta conexión.
   * `install` = HUB_TOKEN (install_compat); no es userId.
   */
  authKind?: "install" | "device" | "browser";
  /** Product AuthSession id (PHASE 57.3). Distinct from connection `id`. */
  authSessionId?: string;
  /** Peer TCP address for PHASE 57.7 remote install_compat gate. */
  remoteAddress?: string;
  /** Solo una respuesta en curso por sesión (protocolo: error `busy`). */
  replying: boolean;
  /** Waiter del turno en curso; permite confirm_response durante busy. */
  confirmationWaiter?: ConfirmationWaiter;
}

const sessions = new Map<WebSocket, Session>();

export function createSession(ws: WebSocket): Session {
  const session: Session = {
    id: `ws_${randomUUID()}`,
    ws,
    authenticated: false,
    replying: false,
  };
  sessions.set(ws, session);
  return session;
}

export function dropSession(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (session?.confirmationWaiter) {
    session.confirmationWaiter.cancelAll();
    session.confirmationWaiter = undefined;
  }
  sessions.delete(ws);
}

export function connectedDevices(): string[] {
  return [...sessions.values()]
    .filter((s) => s.authenticated && s.deviceId)
    .map((s) => s.deviceId!);
}

/** Invalida confirmaciones pendientes (p. ej. Agent desconectado). */
export function cancelAllConfirmations(): void {
  for (const session of sessions.values()) {
    session.confirmationWaiter?.cancelAll();
  }
}

/**
 * Terminate WS connections bound to a product AuthSession (revoke → kill).
 * Marks connection unauthenticated and closes the socket.
 */
export function killConnectionsForAuthSession(authSessionId: string): number {
  let n = 0;
  for (const session of sessions.values()) {
    if (session.authSessionId !== authSessionId) continue;
    session.authenticated = false;
    session.authSessionId = undefined;
    session.confirmationWaiter?.cancelAll();
    session.confirmationWaiter = undefined;
    try {
      session.ws.close();
    } catch {
      /* ignore */
    }
    n += 1;
  }
  return n;
}

/**
 * Close all WS connections for a trusted device (device revoke cascade).
 * Covers sockets still authenticated under that deviceId.
 */
export function killConnectionsForDevice(deviceId: string): number {
  let n = 0;
  for (const session of sessions.values()) {
    if (session.deviceId !== deviceId) continue;
    session.authenticated = false;
    session.authSessionId = undefined;
    session.confirmationWaiter?.cancelAll();
    session.confirmationWaiter = undefined;
    try {
      session.ws.close();
    } catch {
      /* ignore */
    }
    n += 1;
  }
  return n;
}

export function listConnections(): readonly Session[] {
  return [...sessions.values()];
}
