import type { ConnectionConfig } from "../types";

const KEY = "pa_console_session_v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `web_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function loadSession(): ConnectionConfig | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectionConfig;
    if (!parsed.token || !parsed.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(cfg: ConnectionConfig): void {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      httpBase: cfg.httpBase ?? "",
      token: cfg.token,
      deviceId: cfg.deviceId,
      deviceName: cfg.deviceName || "Agent Console",
    }),
  );
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}

export function ensureDeviceId(existing?: string): string {
  return existing && existing.length > 0 ? existing : randomId();
}
