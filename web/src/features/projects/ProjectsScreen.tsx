import { useEffect, useState } from "react";
import { listWorkspaces, resolveHttpBase, type WorkspaceRow } from "../../api/http";
import { useApp } from "../../state/AppContext";

/**
 * Proyectos (producto) aún no tienen API.
 * Mostramos espacios lógicos del Gateway como referencia — no son Projects.
 */
export function ProjectsScreen() {
  const { session } = useApp();
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const base = resolveHttpBase(session);
        const list = await listWorkspaces(base, session.token);
        if (!cancelled) {
          setRows(list);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("No se pudieron cargar los espacios del Gateway.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Proyectos</h1>
        <p className="muted">
          Contenedores de trabajo con peso (conversaciones, research, archivos, tareas).
          La API de Proyectos aún no existe en el Gateway.
        </p>
      </header>

      <div className="placeholder-card fade-in">
        <strong>Próximamente · Projects</strong>
        <p className="muted">
          Cuando exista el contrato, aquí verás proyectos reales — no inventamos endpoints.
        </p>
      </div>

      <section style={{ marginTop: 28 }}>
        <h2 className="section-label">Espacios lógicos (Gateway)</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13.5 }}>
          Esto es <code>/workspaces</code> — distinto de Proyectos. Se muestra para no perder
          la capacidad ya conectada.
        </p>
        {loading ? <p className="muted">Cargando…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="muted">No hay espacios todavía.</p>
        ) : null}
        <div className="project-grid">
          {rows.map((w) => (
            <article key={w.id} className="project-card static">
              <h3>{w.name}</h3>
              <p className="muted">{w.description || "Sin descripción"}</p>
              <span className="muted" style={{ fontSize: 12 }}>
                {w.id.slice(0, 8)}…
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
