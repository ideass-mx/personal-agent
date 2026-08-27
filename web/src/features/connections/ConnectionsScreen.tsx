import { maskToken } from "../../lib/sanitize";
import { useApp } from "../../state/AppContext";

export function ConnectionsScreen() {
  const { health, session, wsStatus } = useApp();
  const devices = health?.devices ?? [];

  return (
    <div className="panel">
      <h1>Connections</h1>
      <p className="lead">
        Clientes conectados al Gateway (snapshot de sesiones WS vía{" "}
        <code>/health</code>).
      </p>
      <h2>Connected Clients</h2>
      <ul className="status-rows">
        <li>
          <span>Web Browser (esta consola)</span>
          <span>
            {wsStatus === "authenticated" ? "● Connected" : "○ Disconnected"}
          </span>
        </li>
        {devices.map((d) => (
          <li key={d}>
            <span>{d.includes("android") || d.includes("Android") ? "Android" : d}</span>
            <span>● Connected</span>
          </li>
        ))}
      </ul>
      {devices.length === 0 && wsStatus !== "authenticated" ? (
        <p className="muted">Ningún cliente autenticado.</p>
      ) : null}
      <h2 style={{ marginTop: 24 }}>Pairing</h2>
      <p className="muted">
        Usa el mismo token de instalación (<code>HUB_TOKEN</code>) en Android y
        en Agent Console. No se muestra el token completo aquí.
      </p>
      {session ? (
        <ul className="status-rows">
          <li>
            <span>Host</span>
            <span>{session.httpBase || location.origin}</span>
          </li>
          <li>
            <span>Token</span>
            <span>{maskToken(session.token)}</span>
          </li>
          <li>
            <span>Device</span>
            <span>{session.deviceName}</span>
          </li>
        </ul>
      ) : null}
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>
        QR / identity — FUTURE. LOCAL y LAN en alcance; INTERNET — FUTURE.
      </p>
    </div>
  );
}
