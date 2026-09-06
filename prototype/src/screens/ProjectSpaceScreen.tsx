import { DesktopBlock } from "../structured/DesktopBlock";
import { projectSummaryBlocks } from "../mock/data";
import { useApp } from "../state/AppState";
import type { ProjectTab } from "../types";
import { CAPABILITY_LABELS } from "../types";

const TABS: Array<{ id: ProjectTab; label: string }> = [
  { id: "summary", label: "Resumen" },
  { id: "conversations", label: "Conversaciones" },
  { id: "research", label: "Research" },
  { id: "files", label: "Archivos" },
  { id: "tasks", label: "Tareas" },
  { id: "artifacts", label: "Artefactos" },
];

export function ProjectSpaceScreen() {
  const {
    nav,
    projects,
    conversations,
    files,
    tasks,
    setNav,
    openConversation,
  } = useApp();

  if (nav.screen !== "project") return null;
  const project = projects.find((p) => p.id === nav.projectId);
  if (!project) return null;

  const accent = project.capabilities.find((c) => c !== "personal") ?? "personal";

  return (
    <div className="screen" data-agent={accent}>
      <header className="screen-header">
        <h1>{project.name}</h1>
        <p className="muted">{project.description}</p>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={nav.tab === tab.id}
            className={nav.tab === tab.id ? "active" : ""}
            onClick={() => setNav({ screen: "project", projectId: project.id, tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-panel fade-in">
        {nav.tab === "summary" ? <DesktopBlock blocks={projectSummaryBlocks(project)} /> : null}

        {nav.tab === "conversations" ? (
          <ul className="entity-list">
            {conversations
              .filter((c) => c.projectId === project.id)
              .map((c) => (
                <li key={c.id}>
                  <button type="button" className="entity-row" onClick={() => openConversation(c.id)}>
                    <strong>{c.title}</strong>
                    <span className="muted">{c.preview}</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : null}

        {nav.tab === "research" ? (
          <DesktopBlock
            blocks={[
              {
                type: "text",
                tone: "muted",
                text: "Investigación acotada a este proyecto.",
              },
              {
                type: "cards",
                cards: [
                  {
                    id: "r1",
                    title: "Comparativa fintech",
                    body: "México vs Brasil — 18 fuentes",
                    capability: "research",
                    badge: "Activo",
                  },
                ],
              },
            ]}
          />
        ) : null}

        {nav.tab === "files" ? (
          <ul className="entity-list">
            {files
              .filter((f) => f.projectId === project.id)
              .map((f) => (
                <li key={f.id} className="entity-row static">
                  <strong>{f.name}</strong>
                  <span className="muted">
                    {f.kind} · origen {f.origin ? CAPABILITY_LABELS[f.origin] : "—"}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}

        {nav.tab === "tasks" ? (
          <ul className="entity-list">
            {tasks
              .filter((t) => t.projectId === project.id)
              .map((t) => (
                <li key={t.id} className="entity-row static">
                  <strong>
                    {t.needsApproval ? "● " : ""}
                    {t.title}
                  </strong>
                  <span className="cap-chip" data-agent={t.capability}>
                    {CAPABILITY_LABELS[t.capability]}
                  </span>
                </li>
              ))}
          </ul>
        ) : null}

        {nav.tab === "artifacts" ? (
          <DesktopBlock
            blocks={[
              {
                type: "artifact",
                id: "art1",
                title: "Borrador ejecutivo Q3",
                kind: "Informe",
                preview: "1 página · listo para revisión",
                capability: "office",
              },
              {
                type: "artifact",
                id: "art2",
                title: "Tabla de fuentes",
                kind: "Tabla",
                preview: "18 filas citables",
                capability: "research",
              },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
