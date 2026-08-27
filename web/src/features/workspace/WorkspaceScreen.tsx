import { useCallback, useEffect, useState } from "react";
import { listWorkspaces, type WorkspaceRow } from "../../api/http";
import { resolveHttpBase } from "../../api/http";
import { useApp } from "../../state/AppContext";

export function WorkspaceScreen() {
  const { session } = useApp();
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const base = resolveHttpBase(session);
      const list = await listWorkspaces(base, session.token);
      setRows(list);
    } catch {
      setError("No se pudieron cargar los workspaces lógicos.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel">
      <h1>Workspace</h1>
      <p className="lead">
        Workspaces lógicos vía HTTP del Gateway. El filesystem root del Agent Host
        (<code> AGENT_FILESYSTEM_ROOT </code>
        no está expuesto por API segura — cambiarlo es{" "}
        <strong>REQUIRED/FUTURE</strong> (R-49-03) o vía tray/Host config.
      </p>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          Actualizar
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Cargando…</p> : null}
      {!loading && rows.length === 0 && !error ? (
        <p className="muted">No hay workspaces lógicos configurados.</p>
      ) : null}
      <ul className="status-rows">
        {rows.map((w) => (
          <li key={w.id}>
            <span>
              <strong>{w.name}</strong>
              {w.description ? (
                <span className="muted"> — {w.description}</span>
              ) : null}
            </span>
            <span className="muted">{w.id.slice(0, 8)}…</span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Status filesystem: no demostrable desde Console sin API Host. El navegador
        nunca resuelve rutas locales.
      </p>
    </div>
  );
}
