import type { WebSocket } from "ws";

export interface Session {
  ws: WebSocket;
  authenticated: boolean;
  deviceId?: string;
  deviceName?: string;
  /** Solo una respuesta en curso por sesión (protocolo: error `busy`). */
  replying: boolean;
}

const sessions = new Map<WebSocket, Session>();

export function createSession(ws: WebSocket): Session {
  const session: Session = { ws, authenticated: false, replying: false };
  sessions.set(ws, session);
  return session;
}

export function dropSession(ws: WebSocket): void {
  sessions.delete(ws);
}

export function connectedDevices(): string[] {
  return [...sessions.values()]
    .filter((s) => s.authenticated && s.deviceId)
    .map((s) => s.deviceId!);
}
