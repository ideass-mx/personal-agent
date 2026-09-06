import { DesktopBlock } from "../structured/DesktopBlock";
import { useApp } from "../state/AppState";
import { IconStop } from "../components/icons";

export function AgentSpaceScreen() {
  const {
    agentBlocks,
    agentCapability,
    agentMode,
    startResearchDemo,
    stopAgentWork,
    showResearchResults,
  } = useApp();

  return (
    <div className="workspace-split" data-agent={agentCapability}>
      <div className="workspace-main">
        <div className="workspace-inner">
          {agentMode === "idle" ? (
            <div className="agent-hero fade-in">
              <DesktopBlock blocks={agentBlocks} />
              <div className="row-actions">
                <button type="button" className="btn btn-primary" onClick={startResearchDemo}>
                  Empezar investigación demo
                </button>
              </div>
            </div>
          ) : null}

          {agentMode === "working" ? (
            <div className="fade-in">
              <DesktopBlock blocks={agentBlocks} />
              <div className="row-actions sticky-actions">
                <button type="button" className="btn btn-ghost" onClick={stopAgentWork}>
                  <IconStop size={16} /> Detener
                </button>
                <button type="button" className="btn btn-primary" onClick={showResearchResults}>
                  Ver resultados (demo)
                </button>
              </div>
            </div>
          ) : null}

          {agentMode === "results" ? (
            <div className="fade-in">
              <DesktopBlock blocks={agentBlocks} />
              <div className="row-actions sticky-actions">
                <button type="button" className="btn btn-primary">
                  Comparar
                </button>
                <button type="button" className="btn btn-ghost">
                  Ver fuentes
                </button>
                <button type="button" className="btn btn-ghost">
                  Crear informe
                </button>
                <button type="button" className="btn btn-ghost" onClick={stopAgentWork}>
                  Nueva búsqueda
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="context-chat">
        <header className="context-head">
          <strong>Conversación</strong>
          <span className="muted">Contexto de esta tarea</span>
        </header>
        <div className="context-messages">
          <div className="bubble user">Comparar fintechs México vs Brasil para el board.</div>
          <div className="bubble agent">
            <span className="cap-chip" data-agent="research">
              Research
            </span>
            <p className="agent-voice">Voy a armar la comparación en tres ejes y citar fuentes.</p>
          </div>
          {agentMode !== "idle" ? (
            <div className="bubble agent">
              <span className="cap-chip" data-agent="research">
                Research
              </span>
              <p>
                {agentMode === "working"
                  ? "Estoy recogiendo fuentes regulatorias y de funding…"
                  : "Listo. Puedes comparar, ver fuentes o crear el informe."}
              </p>
            </div>
          ) : null}
        </div>
        <form
          className="composer compact"
          onSubmit={(e) => {
            e.preventDefault();
            if (agentMode === "idle") startResearchDemo();
          }}
        >
          <input placeholder="Añade contexto a esta tarea…" />
          <button type="submit" className="btn btn-primary">
            Enviar
          </button>
        </form>
      </aside>
    </div>
  );
}
