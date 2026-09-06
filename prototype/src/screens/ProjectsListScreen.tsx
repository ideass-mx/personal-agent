import { useApp } from "../state/AppState";
import { CAPABILITY_LABELS } from "../types";

export function ProjectsListScreen() {
  const { projects, openProject, setCreateProjectOpen } = useApp();

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header row">
        <div>
          <h1>Proyectos</h1>
          <p className="muted">Contenedores de trabajo con peso: conversaciones, research, archivos y tareas.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateProjectOpen(true)}>
          Nuevo proyecto
        </button>
      </header>

      <div className="project-grid fade-in">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className="project-card"
            onClick={() => openProject(p.id)}
          >
            <h3>{p.name}</h3>
            <p className="muted">{p.description}</p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${p.progress}%` }} />
            </div>
            <div className="card-meta">
              <span className="muted">{p.progress}%</span>
              <span className="cap-row">
                {p.capabilities.map((c) => (
                  <span key={c} className="cap-chip" data-agent={c}>
                    {CAPABILITY_LABELS[c]}
                  </span>
                ))}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
