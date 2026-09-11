import { useCompanion } from "./CompanionContext";

export function CompanionActivityScreen() {
  const { activity, workspaces, openWorkspace } = useCompanion();

  return (
    <div className="cp-activity screen" data-agent="personal">
      <header className="screen-header">
        <h1>Activity</h1>
        <p className="muted">
          Transparencia: qué ha estado haciendo el agente.
        </p>
      </header>

      <ol className="cp-timeline">
        {activity.map((a) => (
          <li key={a.id}>
            <time dateTime={new Date(a.at).toISOString()}>
              {new Date(a.at).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <div>
              <strong>{a.title}</strong>
              {a.detail ? <p className="muted">{a.detail}</p> : null}
              {a.projectId ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => openWorkspace(a.projectId!)}
                >
                  {workspaces.find((w) => w.id === a.projectId)?.name ||
                    "Abrir espacio"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
