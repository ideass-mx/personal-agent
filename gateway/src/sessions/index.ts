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
