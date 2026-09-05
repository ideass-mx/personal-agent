import { useEffect, useMemo, useState } from "react";
import { fetchRecentDiagnostics } from "../../api/diagnostics";
import { resolveHttpBase } from "../../api/http";
import { sanitizeDiagnostics } from "../../lib/sanitize";
import { useApp } from "../../state/AppContext";
import type { DiagnosticEventRow } from "../../types";

export function DiagnosticsScreen() {
  const {
    health,
    healthError,
    wsStatus,
    session,
    refreshHealth,
    bannerError,
    bannerDiagnostic,
  } = useApp();
  const [recent, setRecent] = useState<DiagnosticEventRow[]>([]);

  useEffect(() => {
    if (!session) return;
    const base = resolveHttpBase(session);
    void fetchRecentDiagnostics(base, session.token, 12)
      .then(setRecent)
      .catch(() => {});
  }, [session]);

  const report = useMemo(() => {
    const lines = [
      "Personal Agent — Diagnostics",
      `Generated: ${new Date().toISOString()}`,
      `Gateway: ${healthError ? "unavailable" : health?.ok ? "ok" : "unknown"}`,
      `Node (boot snapshot): ${health?.agentReady ? "ready" : "not_ready"}`,
      `MCP/Tools (boot snapshot): ${health?.agentTools?.length ?? 0} tools`,
      `WebSocket: ${wsStatus}`,
      `HTTP base: ${session?.httpBase || "(same-origin)"}`,
      `Devices: ${(health?.devices ?? []).join(", ") || "(none)"}`,
      `API name: ${health?.name ?? "—"}`,
      `Banner: ${bannerError ?? "(none)"}`,
      bannerDiagnostic
        ? `Last diagnostic: ${bannerDiagnostic.errorCode} (${bannerDiagnostic.diagnosticId})`
        : "Last diagnostic: (none)",
      "",
      "Notes:",
      "- Node/MCP/Tools status is a boot snapshot, not live liveness.",
      "- Filesystem workspace path is not exposed over HTTP.",
      "- Secrets redacted; do not paste tokens into chats.",
    ];
    return sanitizeDiagnostics(lines.join("\n"));
  }, [health, healthError, wsStatus, session, bannerError, bannerDiagnostic]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      /* ignore */
    }
  }

  const row = (label: string, ok: boolean | null, detail: string) => (
    <li>
      <span>
        {label} {ok === true ? "●" : ok === false ? "○" : "·"}
      </span>
      <span className="muted">{detail}</span>
    </li>
  );

  return (
    <div className="panel">
      <h1>Diagnostics</h1>
      <p className="lead">
        Información técnica accionable. Sin tokens, API keys ni headers.
      </p>
      <ul className="status-rows">
        {row(
          "Gateway",
          healthError ? false : health?.ok ?? null,
          healthError ? "Agent unavailable" : health?.ok ? "reachable" : "…",
        )}
        {row(
          "Node",
          health ? health.agentReady : null,
          "boot snapshot",
        )}
        {row(
          "MCP",
          health ? health.agentTools.length > 0 : null,
          "boot snapshot",
        )}
        {row(
          "Tools",
          health ? health.agentTools.length > 0 : null,
          `${health?.agentTools.length ?? 0} in snapshot`,
        )}
        {row("Workspace", null, "FS path not on HTTP")}
        {row("Database", null, "no dedicated probe")}
        {row(
          "Network",
          wsStatus === "authenticated",
          wsStatus,
        )}
      </ul>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => void refreshHealth()}>
          Retry
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          Copiar diagnóstico
        </button>
      </div>
      {recent.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 8 }}>Última actividad</h2>
          <ul className="status-rows">
            {recent.slice(0, 6).map((row) => (
              <li key={`${row.diagnosticId}:${row.timestamp}`}>
                <span>{row.timestamp.slice(11, 19)} · {row.event}</span>
                <span className="muted">
                  {row.errorCode || row.component} · {row.diagnosticId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <pre
        style={{
          marginTop: 16,
          fontSize: "0.8rem",
          whiteSpace: "pre-wrap",
          background: "#fafaf9",
          padding: 12,
          borderRadius: 10,
          border: "1px solid var(--border)",
        }}
      >
        {report}
      </pre>
    </div>
  );
}
