import { useEffect, useState } from "react";
import { listWorkspaces, resolveHttpBase, type WorkspaceRow } from "../../api/http";
import { useApp } from "../../state/AppContext";
import { useMockProjects } from "./MockProjectsContext";
import {
  projectTypeLabel,
  type MockProjectType,
} from "./mockProjects";

/**
 * Proyectos (producto) — lista mock + formularios de creación ligera.
 * Artículo científico redirige al mismo flujo de Experience Lab.
 */
export function ProjectsScreen() {
  const { session, setNav } = useApp();
  const {
    projects,
    pendingCreate,
    pendingOpenId,
    activeProjectId,
    clearPendingCreate,
    clearPendingOpen,
    addProject,
    selectProject,
    getProject,
    requestOpen,
  } = useMockProjects();

  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicDraft, setTopicDraft] = useState("");
  const [createType, setCreateType] = useState<MockProjectType | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (
      pendingCreate === "research" ||
      pendingCreate === "document" ||
      pendingCreate === "generic"
    ) {
      setCreateType(pendingCreate);
      setTopicDraft("");
      setDetailId(null);
      clearPendingCreate();
    }
  }, [pendingCreate, clearPendingCreate]);

  useEffect(() => {
    if (!pendingOpenId) return;
    const p = getProject(pendingOpenId);
    if (!p) {
      clearPendingOpen();
      return;
    }
    // Artículo científico: Experience Lab consume pendingOpenId.
    if (p.type === "scientific_article") {
      setNav("experience");
      return;
    }
    clearPendingOpen();
    setDetailId(p.id);
    setCreateType(null);
    selectProject(p.id);
  }, [
    pendingOpenId,
    getProject,
    clearPendingOpen,
    setNav,
    selectProject,
  ]);

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

  function submitCreate() {
    if (!createType || createType === "scientific_article") return;
    const title =
      topicDraft.trim().slice(0, 80) ||
      (createType === "research"
        ? "Nueva investigación"
        : createType === "document"
          ? "Nuevo documento"
          : "Nuevo proyecto");
    const row = addProject({
      title,
      type: createType,
      summary: topicDraft.trim() || undefined,
    });
    setCreateType(null);
    setTopicDraft("");
    setDetailId(row.id);
  }

  const detail = detailId ? getProject(detailId) : null;

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Proyectos</h1>
        <p className="muted">
          Contenedores de trabajo con peso. Los tipos de trabajo son tipos de
          proyecto — no aplicaciones independientes.
        </p>
      </header>

      {createType && createType !== "scientific_article" ? (
        <section className="np-create-form fade-in" aria-live="polite">
          <p className="exp-kicker">Nuevo proyecto</p>
          <h2>
            {createType === "research"
              ? "Nueva investigación"
              : createType === "document"
                ? "Nuevo documento"
                : "Nuevo proyecto"}
          </h2>
          <p className="muted">
            {createType === "research"
              ? "¿Qué quieres investigar?"
              : createType === "document"
                ? "¿Qué quieres crear?"
                : "¿Qué quieres trabajar?"}
          </p>
          <form
            className="np-create-composer"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <input
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              placeholder={
                createType === "research"
                  ? "Escribe el tema..."
                  : "Escribe una descripción..."
              }
              autoFocus
            />
            <button type="submit" className="btn primary">
              Continuar
            </button>
          </form>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setCreateType(null);
              setTopicDraft("");
            }}
          >
            Cancelar
          </button>
          <p className="muted np-mock-note">Mock · sin backend</p>
        </section>
      ) : null}

      {detail && !createType ? (
        <section className="np-project-detail fade-in">
          <p className="exp-kicker">{projectTypeLabel(detail.type)}</p>
          <h2>{detail.title}</h2>
          {detail.summary ? <p className="muted">{detail.summary}</p> : null}
          <p className="muted">
            {detail.type === "research"
              ? "Investigación (no es un artículo científico). Workspace mock."
              : detail.type === "document"
                ? "Documento · workspace mock."
                : "Proyecto genérico · workspace mock."}
          </p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDetailId(null)}
          >
            Volver a la lista
          </button>
        </section>
      ) : null}

      {!createType && !detail ? (
        <>
          <section className="np-project-grid-wrap">
            <h2 className="section-label">Tus proyectos</h2>
            {projects.length === 0 ? (
              <p className="muted">Aún no hay proyectos. Usa + junto a Proyectos.</p>
            ) : (
              <div className="project-grid">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`project-card ${
                      activeProjectId === p.id ? "is-active" : ""
                    }`}
                    onClick={() => {
                      if (p.type === "scientific_article") {
                        requestOpen(p.id);
                        setNav("experience");
                        return;
                      }
                      selectProject(p.id);
                      setDetailId(p.id);
                    }}
                  >
                    <span className="muted" style={{ fontSize: 12 }}>
                      {projectTypeLabel(p.type)}
                    </span>
                    <h3>{p.title}</h3>
                    <p className="muted">
                      {p.summary || "Sin descripción"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

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
        </>
      ) : null}
    </div>
  );
}
