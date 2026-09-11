import { useState } from "react";
import { useCompanion } from "./CompanionContext";

export function CompanionMemoryScreen() {
  const { memory, forgetMemory, rememberText, workspaces } = useCompanion();
  const [draft, setDraft] = useState("");

  const personal = memory.filter((m) => m.scope === "personal");
  const project = memory.filter((m) => m.scope === "project");
  const recent = [...memory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

  function projectName(id?: string) {
    if (!id) return "Proyecto";
    return workspaces.find((w) => w.id === id)?.name || "Proyecto";
  }

  return (
    <div className="cp-memory screen" data-agent="personal">
      <header className="screen-header">
        <h1>Memory</h1>
        <p className="muted">
          Lo que el agente recuerda de ti y de tus espacios — en lenguaje humano.
        </p>
      </header>

      <form
        className="cp-remember"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          rememberText(draft.trim());
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Recuerda esto…"
          aria-label="Nueva memoria"
        />
        <button type="submit" className="btn">
          Recordar
        </button>
      </form>

      <section>
        <h2 className="section-label">Personal</h2>
        <ul className="cp-mem-list">
          {personal.map((m) => (
            <li key={m.id}>
              <span>{m.text}</span>
              <button type="button" className="btn ghost sm" onClick={() => forgetMemory(m.id)}>
                Olvidar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-label">Proyecto</h2>
        <ul className="cp-mem-list">
          {project.map((m) => (
            <li key={m.id}>
              <div>
                <span className="muted">{projectName(m.projectId)} · </span>
                {m.text}
              </div>
              <button type="button" className="btn ghost sm" onClick={() => forgetMemory(m.id)}>
                Olvidar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-label">Recientemente recordado</h2>
        <ul className="cp-mem-list">
          {recent.map((m) => (
            <li key={`r-${m.id}`}>
              <span>{m.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
