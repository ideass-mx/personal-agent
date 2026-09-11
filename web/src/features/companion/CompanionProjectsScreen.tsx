import { useCompanion } from "./CompanionContext";
import { kindLabel } from "./types";

export function CompanionProjectsScreen() {
  const { workspaces, openWorkspace, startCreateProject } = useCompanion();

  return (
    <div className="cp-projects screen" data-agent="personal">
      <header className="screen-header cp-projects-head">
        <div>
          <h1>Proyectos</h1>
          <p className="muted">
            Espacios de trabajo. Se consultan y comandan desde el chat.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => startCreateProject()}
        >
          Nuevo proyecto
        </button>
      </header>

      <div className="cp-project-grid">
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            className="cp-project-card"
            onClick={() => openWorkspace(w.id)}
          >
            <span className="muted">{kindLabel(w.kind)}</span>
            <h3>{w.name}</h3>
            <p className="muted">{w.objective}</p>
            <div className="cp-project-meta">
              <span
                className={`cp-status cp-status-${w.status}`}
                title={
                  w.status === "live"
                    ? "Trabajando"
                    : w.status === "wait"
                      ? "Esperándote"
                      : "Inactivo"
                }
              >
                {w.status === "live"
                  ? "Trabajando"
                  : w.status === "wait"
                    ? "Esperándote"
                    : "Inactivo"}
              </span>
              <span className="muted">{w.progress}%</span>
            </div>
            <div className="cp-progress" aria-hidden>
              <span style={{ width: `${w.progress}%` }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
