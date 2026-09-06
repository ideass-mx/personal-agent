import { useApp } from "../../state/AppContext";

/** Lista agregada de conversaciones (HTTP Gateway). */
export function ConversationsListScreen() {
  const { conversations, selectConversation, newConversation, setNav } = useApp();

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header row">
        <div>
          <h1>Conversaciones</h1>
          <p className="muted">Capa transversal — un hilo puede atravesar varias capacidades.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void newConversation()}>
          Nueva
        </button>
      </header>

      {conversations.length === 0 ? (
        <div className="placeholder-card fade-in">
          <strong>No hay conversaciones</strong>
          <p className="muted">Crea una o escribe desde el espacio del agente.</p>
          <button type="button" className="btn btn-primary" onClick={() => setNav("agent")}>
            Ir al agente
          </button>
        </div>
      ) : (
        <ul className="entity-list fade-in">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="entity-row"
                onClick={() => void selectConversation(c.id)}
              >
                <strong>{c.title || `Conversación ${c.id.slice(0, 8)}…`}</strong>
                <span className="muted">
                  {new Date(c.createdAt).toLocaleString()}
                  {c.workspaceId ? ` · espacio ${c.workspaceId.slice(0, 8)}…` : " · suelto"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
