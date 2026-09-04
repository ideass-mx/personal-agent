/**
 * In-memory waiters: pairing_request WS sockets awaiting Desktop approve/reject.
 * One waiter per pairingSessionId; second distinct device is rejected.
 */
import type { WebSocket } from "ws";

type Waiter = {
  ws: WebSocket;
  deviceId: string;
  pairingSessionId: string;
};

const waiters = new Map<string, Waiter>();

export type RegisterPairingWaiterResult =
  | { ok: true }
  | { ok: false; code: "pairing_waiter_busy"; message: string };

/**
 * Registers a waiter. Same device may replace its own socket (reconnect).
 * A different device for the same session is rejected (no last-writer-wins).
 */
export function registerPairingWaiter(
  pairingSessionId: string,
  waiter: Waiter,
): RegisterPairingWaiterResult {
  const existing = waiters.get(pairingSessionId);
  if (
    existing &&
    existing.deviceId !== waiter.deviceId &&
    existing.ws !== waiter.ws
  ) {
    return {
      ok: false,
      code: "pairing_waiter_busy",
      message: "Otro dispositivo ya espera confirmacion para esta sesion.",
    };
  }
  waiters.set(pairingSessionId, waiter);
  return { ok: true };
}

export function takePairingWaiter(pairingSessionId: string): Waiter | undefined {
  const w = waiters.get(pairingSessionId);
  waiters.delete(pairingSessionId);
  return w;
}

export function dropPairingWaiterByWs(ws: WebSocket): void {
  for (const [id, w] of waiters) {
    if (w.ws === ws) waiters.delete(id);
  }
}

/** Test helper. */
export function clearPairingWaitersForTests(): void {
  waiters.clear();
}
