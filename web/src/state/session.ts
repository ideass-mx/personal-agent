import type { ConnectionConfig } from "../types";

const KEY = "pa_console_session_v1";
const HOST_BOOTSTRAP_KEY = "pa_host_bootstrap";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `web_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/**
 * Persistencia durable en localStorage (sobrevive cerrar el navegador).
 * Migra desde sessionStorage si aún hay datos de una sesión anterior.
 */
function readRaw(key: string): string | null {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) {
      try {
        localStorage.setItem(key, fromSession);
      } catch {
        /* ignore quota / private mode */
      }
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadSession(): ConnectionConfig | null {
  try {
    const raw = readRaw(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectionConfig;
    if (!parsed.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(cfg: ConnectionConfig): void {
  writeRaw(
    KEY,
    JSON.stringify({
      httpBase: cfg.httpBase ?? "",
      token: cfg.token ?? "",
      deviceId: cfg.deviceId,
      deviceName: cfg.deviceName || "Agent Console",
    }),
  );
}

export function clearSession(): void {
  removeRaw(KEY);
  removeRaw(HOST_BOOTSTRAP_KEY);
}

export function setHostBootstrapFlag(on = true): void {
  if (on) writeRaw(HOST_BOOTSTRAP_KEY, "1");
  else removeRaw(HOST_BOOTSTRAP_KEY);
}

export function isHostBootstrap(): boolean {
  return readRaw(HOST_BOOTSTRAP_KEY) === "1";
}

export function ensureDeviceId(existing?: string): string {
  return existing && existing.length > 0 ? existing : randomId();
}
