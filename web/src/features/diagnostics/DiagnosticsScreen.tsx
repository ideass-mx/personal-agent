import { useMemo } from "react";
import { sanitizeDiagnostics } from "../../lib/sanitize";
import { useApp } from "../../state/AppContext";

export function DiagnosticsScreen() {
  const { health, healthError, wsStatus, session, refreshHealth, bannerError } =
    useApp();

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
      "",
      "Notes:",
      "- Node/MCP/Tools status is a boot snapshot, not live liveness.",
      "- Filesystem workspace path is not exposed over HTTP.",
      "- Secrets redacted; do not paste tokens into chats.",
    ];
    return sanitizeDiagnostics(lines.join("\n"));
  }, [health, healthError, wsStatus, session, bannerError]);

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
