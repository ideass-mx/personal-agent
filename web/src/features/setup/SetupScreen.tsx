import { useState, type FormEvent } from "react";
import { useApp } from "../../state/AppContext";
import { ensureDeviceId } from "../../state/session";

type Mode = "welcome" | "not_ready";

export function SetupScreen({ mode }: { mode: Mode }) {
  const { connect, health, healthError, refreshHealth, setNav, wsStatus } =
    useApp();
  const [httpBase, setHttpBase] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onConfigure(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await connect({
        httpBase: httpBase.trim(),
        token: token.trim(),
        deviceId: ensureDeviceId(),
        deviceName: "Agent Console",
      });
    } catch {
      setErr("No se pudo conectar al Agent Host.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "welcome") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Welcome to Personal Agent</h1>
          <p className="lead">
            Your agent lives on this PC. Connect Agent Console to the Agent Host
            with your installation token.
          </p>
          <form onSubmit={onConfigure}>
            <label className="field">
              Host URL (vacío = mismo origen)
              <input
                value={httpBase}
                onChange={(e) => setHttpBase(e.target.value)}
                placeholder="http://192.168.1.10:8787"
                autoComplete="off"
              />
            </label>
            <label className="field">
              Token de instalación
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="HUB_TOKEN"
                autoComplete="off"
                required
              />
            </label>
            {err ? <p className="error">{err}</p> : null}
            <div className="actions">
              <button
                type="submit"
                className="btn primary"
                disabled={busy || !token.trim()}
              >
                Configure Agent
              </button>
            </div>
          </form>
          <p className="muted" style={{ marginTop: 16, fontSize: "0.85rem" }}>
            LOCAL · LAN · INTERNET — FUTURE
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Agent is not ready</h1>
      <p className="lead">
        Personal Agent could not reach a healthy Agent Host, or the host is not
        ready yet.
      </p>
      <ul className="status-rows">
        <li>
          <span>Gateway</span>
          <span>{health?.ok ? "reachable" : healthError ? "unavailable" : "…"}</span>
        </li>
        <li>
          <span>Node</span>
          <span>
            {health
              ? health.agentReady
                ? "ready (boot snapshot)"
                : "not ready (boot snapshot)"
              : "unknown"}
          </span>
        </li>
        <li>
          <span>MCP / Tools</span>
          <span>
            {health
              ? `${health.agentTools.length} tools (boot snapshot)`
              : "unknown"}
          </span>
        </li>
        <li>
          <span>WebSocket</span>
          <span>{wsStatus}</span>
        </li>
        <li>
          <span>Workspace</span>
          <span className="muted">vía Host (sin path en HTTP)</span>
        </li>
      </ul>
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => void refreshHealth()}
        >
          Retry
        </button>
        <button type="button" className="btn" onClick={() => setNav("diagnostics")}>
          Diagnostics
        </button>
      </div>
    </div>
  );
}
