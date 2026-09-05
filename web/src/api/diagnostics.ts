import type { DiagnosticEventRow } from "../types";

function authHeaders(token: string): HeadersInit {
  if (!token.trim()) {
    return { Accept: "application/json" };
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export async function fetchRecentDiagnostics(
  base: string,
  token: string,
  limit = 25,
): Promise<DiagnosticEventRow[]> {
  const res = await fetch(`${base}/v1/diagnostics/recent?limit=${limit}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`diagnostics_recent_${res.status}`);
  const json = (await res.json()) as { events?: DiagnosticEventRow[] };
  return Array.isArray(json.events) ? json.events : [];
}

