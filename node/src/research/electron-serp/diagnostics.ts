/**
 * Diagnósticos de entorno — solo lectura; sin spoofing.
 */
import type { ElectronSerpEnvSnapshot } from "./types.ts";

const SENSITIVE = /token|secret|api[_-]?key|session|credential|authorization|passwd|password/i;

export function redactSensitiveString(s: string): string {
  if (SENSITIVE.test(s)) return "[redacted]";
  return s;
}

/** Sanitiza URL: quita params sensibles. */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (SENSITIVE.test(u.href)) {
      for (const key of [...u.searchParams.keys()]) {
        if (
          SENSITIVE.test(key) ||
          SENSITIVE.test(u.searchParams.get(key) ?? "")
        ) {
          u.searchParams.delete(key);
        }
      }
      if (SENSITIVE.test(u.pathname)) {
        return `${u.origin}/[redacted]`;
      }
    }
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function sanitizeDiagnosticUrl(
  raw: string | null | undefined,
): string | null {
  return sanitizeUrl(raw);
}

/** JS ejecutado en el renderer: snapshot observable (sin modificar nada). */
export const ENV_SNAPSHOT_EXPRESSION = `(() => {
  const nav = navigator;
  let webglVendor = null;
  let webglRenderer = null;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}
  return {
    webdriver: typeof nav.webdriver === "boolean" ? nav.webdriver : null,
    userAgent: nav.userAgent || null,
    platform: nav.platform || null,
    language: nav.language || null,
    languages: Array.from(nav.languages || []),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: screen.width,
    screenHeight: screen.height,
    webglVendor,
    webglRenderer
  };
})()`;

export function normalizeEnvSnapshot(raw: unknown): ElectronSerpEnvSnapshot {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const languages = Array.isArray(o.languages)
    ? o.languages.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 32))
    : [];
  return {
    webdriver: typeof o.webdriver === "boolean" ? o.webdriver : null,
    userAgent: typeof o.userAgent === "string" ? o.userAgent.slice(0, 240) : null,
    platform: typeof o.platform === "string" ? o.platform.slice(0, 64) : null,
    language: typeof o.language === "string" ? o.language.slice(0, 32) : null,
    languages,
    deviceMemory: typeof o.deviceMemory === "number" ? o.deviceMemory : null,
    hardwareConcurrency:
      typeof o.hardwareConcurrency === "number" ? o.hardwareConcurrency : null,
    innerWidth: typeof o.innerWidth === "number" ? o.innerWidth : null,
    innerHeight: typeof o.innerHeight === "number" ? o.innerHeight : null,
    devicePixelRatio: typeof o.devicePixelRatio === "number" ? o.devicePixelRatio : null,
    screenWidth: typeof o.screenWidth === "number" ? o.screenWidth : null,
    screenHeight: typeof o.screenHeight === "number" ? o.screenHeight : null,
    webglVendor: typeof o.webglVendor === "string" ? o.webglVendor.slice(0, 120) : null,
    webglRenderer: typeof o.webglRenderer === "string" ? o.webglRenderer.slice(0, 200) : null,
  };
}

/** Garantiza que un objeto serializado no incluya secretos obvios. */
export function assertNoSecretsInPayload(payload: unknown): void {
  const s = JSON.stringify(payload);
  if (/Set-Cookie|Authorization:\s*\S+|\"cookie\"\s*:\s*\"[^\"]{8,}/i.test(s)) {
    throw new Error("payload appears to contain secrets");
  }
  if (SENSITIVE.test(s) && /"(password|apiKey|api_key|access_token|refresh_token)"\s*:/i.test(s)) {
    throw new Error("payload appears to contain secrets");
  }
}
