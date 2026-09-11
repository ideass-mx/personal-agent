import { useMemo, useState } from "react";
import { useCompanion } from "./CompanionContext";
import { CompanionMessageList } from "./components/CompanionMessageList";
import type { CompanionMessage } from "./types";

type CompanionTab = "activity" | "context" | "tasks";

export function WorkspaceScreen() {
  const {
    workspaces,
    activeWorkspaceId,
    workspaceMessages,
    workspaceDraft,
    setWorkspaceDraft,
    sendWorkspace,
    setCompanionNav,
    memory,
    tasks,
    activity,
  } = useCompanion();
  const ws = workspaces.find((w) => w.id === activeWorkspaceId);
  const [section, setSection] = useState("Overview");
  const [tab, setTab] = useState<CompanionTab>("activity");

  const msgs = useMemo(
    () => (activeWorkspaceId ? workspaceMessages[activeWorkspaceId] || [] : []),
    [activeWorkspaceId, workspaceMessages],
  );

  if (!ws) {
    return (
      <div className="screen">
        <p className="muted">No hay espacio abierto.</p>
        <button
          type="button"
          className="btn"
          onClick={() => setCompanionNav("projects")}
        >
          Ver proyectos
        </button>
      </div>
    );
  }

  const sections = ["Overview", ...ws.sections];
  const projectMemory = memory.filter(
    (m) => m.projectId === ws.id && m.status === "ACTIVE",
  );
  const projectTasks = tasks.filter((t) => t.projectId === ws.id);
  const projectActivity = activity.filter((a) => a.projectId === ws.id);

  return (
    <div className="cp-workspace" data-agent="personal">
      <aside className="cp-ws-nav" aria-label="Secciones">
        <button
          type="button"
          className="cp-ws-back"
          onClick={() => setCompanionNav("projects")}
        >
          ← Proyectos
        </button>
        <p className="cp-ws-name">{ws.name}</p>
        <nav>
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              className={section === s ? "active" : ""}
              onClick={() => setSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>
      </aside>

      <main className="cp-ws-surface">
        {section === "Overview" ? (
          <div className="cp-ws-overview">
            <p className="cp-card-kicker">Mientras no estabas</p>
            <ul>
              {(ws.whileAway || ["Sin novedades recientes."]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h2>Objetivo</h2>
            <p>{ws.objective}</p>
            <h2>Progreso</h2>
            <div className="cp-progress lg">
              <span style={{ width: `${ws.progress}%` }} />
            </div>
            <p className="muted">{ws.progress}%</p>
            <h2>Qué sigue</h2>
            <ul>
              {(ws.nextSteps || []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {ws.needsDecision ? (
              <div className="cp-card cp-card-attention">
                <p className="cp-card-kicker">Necesita tu decisión</p>
                <p>{ws.needsDecision}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="cp-ws-doc">
            <h2>{section}</h2>
            <p className="muted">
              Superficie de trabajo real — no es el chat. Aquí vive el material
              de «{section}».
            </p>
            <div className="cp-doc-canvas" contentEditable suppressContentEditableWarning>
              {section === "Manuscrito" || section === "Capítulos"
                ? `# ${ws.name}\n\nEmpieza a escribir aquí. El compañero a la derecha permanece anclado a este espacio.`
                : section === "Itinerario"
                  ? "Día 1 · Tokio\nDía 2 · Kioto\n…"
                  : section === "Fuentes" || section === "Investigación"
                    ? "Lista de fuentes y hallazgos.\n· Fuente A\n· Fuente B"
                    : `Notas de ${section} para ${ws.name}.`}
            </div>
          </div>
        )}
      </main>

      <aside className="cp-ws-companion" aria-label="Compañero del espacio">
        <div className="cp-ws-comp-head">
          <strong>Compañero</strong>
          <span className="muted">acotado a {ws.name}</span>
        </div>
        <div className="cp-ws-tabs" role="tablist">
          {(
            [
              ["activity", "Activity"],
              ["context", "Context"],
              ["tasks", "Tasks"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cp-ws-comp-body">
          {tab === "activity" ? (
            <ul className="cp-simple-list">
              {(projectActivity.length
                ? projectActivity
                : activity.slice(0, 4)
              ).map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <span className="muted">{a.detail}</span>
                </li>
              ))}
              <li>
                <CompanionMessageList
                  messages={msgs}
                  onCardAction={() => {}}
                  onAction={(_m: CompanionMessage) => {}}
                />
              </li>
            </ul>
          ) : null}
          {tab === "context" ? (
            <div>
              <p className="muted">Este proyecto sabe de…</p>
              <ul className="cp-simple-list">
                {projectMemory.map((m) => (
                  <li key={m.id}>{m.content}</li>
                ))}
                {projectMemory.length === 0 ? (
                  <li className="muted">Aún sin memorias de proyecto.</li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {tab === "tasks" ? (
            <ul className="cp-simple-list">
              {projectTasks.length === 0 ? (
                <li className="muted">Sin tareas ligadas aún.</li>
              ) : (
                projectTasks.map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong>
                    <span className="muted">
                      {t.owner === "agent" ? "Agente" : "Tú"} · {t.state}
                    </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        <form
          className="cp-composer compact"
          onSubmit={(e) => {
            e.preventDefault();
            sendWorkspace();
          }}
        >
          <textarea
            rows={2}
            value={workspaceDraft}
            onChange={(e) => setWorkspaceDraft(e.target.value)}
            placeholder={`Hablar del espacio…`}
            aria-label="Mensaje del espacio"
          />
          <button type="submit" className="btn primary" disabled={!workspaceDraft.trim()}>
            Enviar
          </button>
        </form>
      </aside>
    </div>
  );
}
