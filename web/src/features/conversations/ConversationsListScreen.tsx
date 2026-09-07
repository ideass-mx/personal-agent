import { useApp } from "../../state/AppContext";

function conversationLabel(c: {
  title: string | null;
  summary?: string | null;
}): { title: string; subtitle: string } {
  const title =
    c.title?.trim() ||
    (c.summary?.trim()
      ? c.summary.trim().length > 48
        ? `${c.summary.trim().slice(0, 48)}…`
        : c.summary.trim()
      : "Nueva conversación");
  const subtitle = c.summary?.trim() && c.title?.trim() ? c.summary.trim() : "";
  return { title, subtitle };
}

/** Lista agregada de conversaciones (HTTP Gateway). */
export function ConversationsListScreen() {
  const { conversations, selectConversation, newConversation, setNav } = useApp();

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header row">
        <div>
          <h1>Conversaciones</h1>
          <p className="muted">Tus hilos recientes con el agente.</p>
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
          {conversations.map((c) => {
            const label = conversationLabel(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="entity-row"
                  onClick={() => void selectConversation(c.id)}
                >
                  <strong>{label.title}</strong>
                  <span className="muted">
                    {label.subtitle ||
                      new Date(c.updatedAt || c.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
