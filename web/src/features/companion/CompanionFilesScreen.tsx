import { useMemo, useState } from "react";
import { useCompanion } from "./CompanionContext";

export function CompanionFilesScreen() {
  const { files, workspaces } = useCompanion();
  const [filter, setFilter] = useState<"all" | "agent" | string>("all");

  const rows = useMemo(() => {
    return files.filter((f) => {
      if (filter === "all") return true;
      if (filter === "agent") return f.byAgent;
      return f.projectId === filter;
    });
  }, [files, filter]);

  return (
    <div className="cp-files screen" data-agent="personal">
      <header className="screen-header">
        <h1>Files</h1>
        <p className="muted">Lo que el agente lee y produce.</p>
      </header>

      <div className="cp-file-filters">
        <button
          type="button"
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Todos
        </button>
        <button
          type="button"
          className={filter === "agent" ? "active" : ""}
          onClick={() => setFilter("agent")}
        >
          Creados por el agente
        </button>
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            className={filter === w.id ? "active" : ""}
            onClick={() => setFilter(w.id)}
          >
            {w.name}
          </button>
        ))}
      </div>

      <ul className="cp-file-list">
        {rows.map((f) => (
          <li key={f.id}>
            <strong>{f.name}</strong>
            <span className="muted">
              {f.kind}
              {f.byAgent ? " · agente" : ""}
              {f.projectId
                ? ` · ${workspaces.find((w) => w.id === f.projectId)?.name || ""}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
