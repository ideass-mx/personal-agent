import { maskToken } from "../../lib/sanitize";
import { useApp } from "../../state/AppContext";

export function SettingsScreen() {
  const { session } = useApp();

  return (
    <div className="panel">
      <h1>Settings</h1>
      <p className="lead">
        Solo configuración soportada de forma segura. Secretos del Host no se
        muestran ni editan desde el navegador.
      </p>

      <h2>Agent</h2>
      <ul className="status-rows">
        <li>
          <span>Nombre de producto</span>
          <span>Personal Agent</span>
        </li>
        <li>
          <span>Cliente</span>
          <span>Agent Console (Web)</span>
        </li>
        <li>
          <span>Idioma UI</span>
          <span>Español (copy de producto)</span>
        </li>
      </ul>

      <h2 style={{ marginTop: 20 }}>Host</h2>
      <ul className="status-rows">
        <li>
          <span>URL</span>
          <span>{session?.httpBase || "(mismo origen)"}</span>
        </li>
        <li>
          <span>Token (enmascarado)</span>
          <span>{session ? maskToken(session.token) : "—"}</span>
        </li>
        <li>
          <span>Device id</span>
          <span className="muted">{session?.deviceId?.slice(0, 12) ?? "—"}…</span>
        </li>
      </ul>

      <p className="muted" style={{ marginTop: 16, fontSize: "0.9rem" }}>
        <strong>REQUIRED/FUTURE:</strong> editar workspace FS root (R-49-03),
        restart Host (R-49-04), config redacted/write-only secrets (R-49-05).
        No se inventa UI para <code>ANTHROPIC_API_KEY</code> /{" "}
        <code>HUB_TOKEN</code> en texto plano.
      </p>
    </div>
  );
}
