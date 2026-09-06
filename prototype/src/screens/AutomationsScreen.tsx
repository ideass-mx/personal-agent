import { useApp } from "../state/AppState";
import { CAPABILITY_LABELS } from "../types";
import { Toggle } from "../components/controls";

export function AutomationsScreen() {
  const { automations, projects, toggleAutomation } = useApp();

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header row">
        <div>
          <h1>Automatizaciones</h1>
          <p className="muted">
            Lo que el agente hace solo por horario o disparador. No se completan: se gestionan.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          Nueva automatización
        </button>
      </header>

      <div className="auto-list fade-in">
        {automations.map((a) => {
          const project = a.projectId
            ? projects.find((p) => p.id === a.projectId)
            : null;
          return (
            <article key={a.id} className="auto-card">
              <div className="auto-head">
                <div>
                  <h3>{a.name}</h3>
                  <p className="muted">
                    {a.trigger} · {a.kind}
                    {project ? ` · ${project.name}` : " · Suelto"}
                  </p>
                </div>
                <Toggle checked={a.enabled} onChange={() => toggleAutomation(a.id)} />
              </div>
              <div className="auto-meta">
                <span className="cap-chip" data-agent={a.capability}>
                  {CAPABILITY_LABELS[a.capability]}
                </span>
                <span className={`status-pill ${a.enabled ? "on" : "off"}`}>
                  {a.enabled ? "Activa" : "Pausada"}
                </span>
              </div>
              <div className="run-history">
                <h4>Historial de corridas</h4>
                <ul>
                  {a.runs.map((r) => (
                    <li key={r.id}>
                      <span className={`run-dot ${r.status}`} />
                      <span>{r.at}</span>
                      <span className="muted">{r.summary}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
