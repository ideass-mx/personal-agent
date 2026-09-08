/**
 * SSRF para research.fetch (Node).
 * Misma política que gateway/src/resources/ssrf.ts — sin importar gateway.
 */
import dns from "node:dns/promises";
import net from "node:net";

export type ResearchSsrfCheckResult =
  | { ok: true; hostname: string; addresses: string[] }
  | { ok: false; reason: string };

export function isBlockedIpAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v) return true;

  if (net.isIPv4(v)) {
    const parts = v.split(".").map((p) => Number(p));
    if (parts.length !== 4) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (net.isIPv6(v)) {
    if (v.startsWith("::ffff:")) {
      const mapped = v.slice(7);
      if (net.isIPv4(mapped)) return isBlockedIpAddress(mapped);
    }
    if (v === "::1" || v === "::") return true;
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    return false;
  }

  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (net.isIP(h)) return isBlockedIpAddress(h);
  return false;
}

export async function assertUrlSafeForResearchFetch(
  urlString: string,
): Promise<ResearchSsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "esquema no permitido" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URL con credenciales bloqueada" };
  }
  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: `hostname bloqueado: ${hostname}` };
  }
  if (net.isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      return { ok: false, reason: `IP bloqueada: ${hostname}` };
    }
    return { ok: true, hostname, addresses: [hostname] };
  }
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length) {
      return { ok: false, reason: "DNS sin direcciones" };
    }
    const addresses = records.map((r) => r.address);
    for (const addr of addresses) {
      if (isBlockedIpAddress(addr)) {
        return { ok: false, reason: `DNS resolvió a IP bloqueada: ${addr}` };
      }
    }
    return { ok: true, hostname, addresses };
  } catch {
    return { ok: false, reason: "fallo resolución DNS" };
  }
}
