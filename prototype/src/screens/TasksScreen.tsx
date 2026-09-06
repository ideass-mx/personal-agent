import { useApp } from "../state/AppState";
import { CAPABILITY_LABELS } from "../types";

const BUCKETS = [
  { id: "today" as const, label: "Hoy" },
  { id: "week" as const, label: "Esta semana" },
  { id: "none" as const, label: "Sin fecha" },
];

export function TasksScreen() {
  const { tasks, projects, toggleTaskDone } = useApp();

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Tareas</h1>
        <p className="muted">
          Acciones, decisiones y aprobaciones que requieren al usuario. Vista agregada — no poseen nada.
        </p>
      </header>

      {BUCKETS.map((bucket) => {
        const items = tasks.filter((t) => t.bucket === bucket.id);
        if (!items.length) return null;
        return (
          <section key={bucket.id} className="task-bucket fade-in">
            <h2>{bucket.label}</h2>
            <ul className="task-list">
              {items.map((t) => {
                const project = t.projectId
                  ? projects.find((p) => p.id === t.projectId)
                  : null;
                return (
                  <li key={t.id} className={`task-row ${t.done ? "done" : ""}`}>
                    <button
                      type="button"
                      className={`check ${t.done ? "on" : ""}`}
                      aria-label="Completar"
                      onClick={() => toggleTaskDone(t.id)}
                    />
                    <div className="task-body">
                      <div className="task-title-row">
                        <strong>{t.title}</strong>
                        {t.needsApproval ? <span className="badge warn">Aprobación</span> : null}
                      </div>
                      {t.detail ? <p className="muted">{t.detail}</p> : null}
                      <div className="task-meta">
                        <span className="muted">{project ? project.name : "Suelto"}</span>
                        <span className="cap-chip" data-agent={t.capability}>
                          {CAPABILITY_LABELS[t.capability]}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
