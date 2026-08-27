import { MVP_CAPABILITIES } from "../../lib/capabilities";
import { useApp } from "../../state/AppContext";

export function OverviewScreen() {
  const { health, healthError, refreshHealth, wsStatus, setNav } = useApp();
  const ready = Boolean(health?.agentReady) && wsStatus === "authenticated";

  return (
    <div className="panel">
      <h1>Overview</h1>
      <p className="lead">
        Estado del Agent Host. Los campos de Node/MCP/Tools son un{" "}
        <strong>snapshot de arranque</strong>, no liveness continuo.
      </p>
      <ul className="status-rows">
        <li>
          <span>Agent Ready</span>
          <span>{ready ? "Yes" : "No"}</span>
        </li>
        <li>
          <span>Gateway</span>
          <span>
            {healthError
              ? "unavailable"
              : health?.ok
                ? "reachable"
                : "unknown"}
          </span>
        </li>
        <li>
          <span>Node (snapshot)</span>
          <span>{health?.agentReady ? "ready" : "not ready / unknown"}</span>
        </li>
        <li>
          <span>MCP / Tools (snapshot)</span>
          <span>
            {health ? `${health.agentTools.length} tools` : "unknown"}
          </span>
        </li>
        <li>
          <span>Workspace</span>
          <span className="muted">path FS no expuesto por HTTP</span>
        </li>
        <li>
          <span>Database</span>
          <span className="muted">inferible vía History (sin probe dedicado)</span>
        </li>
        <li>
          <span>API name</span>
          <span>{health?.name ?? "—"}</span>
        </li>
        <li>
          <span>Connected clients</span>
          <span>{health?.devices?.length ?? 0}</span>
        </li>
        <li>
          <span>WebSocket</span>
          <span>{wsStatus}</span>
        </li>
      </ul>
      {health?.devices?.length ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Devices: {health.devices.join(", ")}
        </p>
      ) : null}
      <div className="actions">
        <button type="button" className="btn" onClick={() => void refreshHealth()}>
          Refresh snapshot
        </button>
        <button type="button" className="btn primary" onClick={() => setNav("chat")}>
          Open Chat
        </button>
        <button type="button" className="btn" onClick={() => setNav("diagnostics")}>
          Diagnostics
        </button>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        {MVP_CAPABILITIES.length} capabilities available (catálogo estático).
      </p>
    </div>
  );
}
