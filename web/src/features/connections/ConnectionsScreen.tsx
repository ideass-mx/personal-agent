import { maskToken } from "../../lib/sanitize";
import { useApp } from "../../state/AppContext";

export function ConnectionsScreen() {
  const { health, session, wsStatus } = useApp();
  const devices = health?.devices ?? [];
  const androidDevices = devices.filter(
    (d) => d.toLowerCase().includes("android") || d.toLowerCase().includes("phone"),
  );

  return (
    <div className="panel">
      <h1>Dispositivos</h1>
      <p className="lead">
        Aquí ves qué dispositivos están usando tu agente. El teléfono y el
        acceso remoto son opcionales.
      </p>
      <h2>Conectados ahora</h2>
      <ul className="status-rows">
        <li>
          <span>Este equipo (consola)</span>
          <span>
            {wsStatus === "authenticated" ? "● Conectado" : "○ Desconectado"}
          </span>
        </li>
        {devices.map((d) => (
          <li key={d}>
            <span>
              {d.toLowerCase().includes("android") ? "Teléfono" : d}
            </span>
            <span>● Conectado</span>
          </li>
        ))}
      </ul>
      {devices.length === 0 && wsStatus !== "authenticated" ? (
        <p className="muted">Ningún dispositivo conectado por ahora.</p>
      ) : null}
      {androidDevices.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Teléfono: no conectado (opcional). Puedes emparejarlo cuando quieras.
        </p>
      ) : null}

      <h2 style={{ marginTop: 24 }}>Emparejar teléfono</h2>
      <p className="muted">
        Usa la opción de emparejamiento desde el asistente de configuración o
        desde el panel de escritorio. No necesitamos mostrar secretos aquí.
      </p>
      {session ? (
        <ul className="status-rows">
          <li>
            <span>Dirección</span>
            <span>{session.httpBase || "Este equipo"}</span>
          </li>
          <li>
            <span>Sesión</span>
            <span>{maskToken(session.token)}</span>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
