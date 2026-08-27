import { useApp } from "../../state/AppContext";

export function ConversationsScreen() {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    newConversation,
    refreshConversations,
    bannerError,
  } = useApp();

  return (
    <div className="panel">
      <h1>Conversations</h1>
      <p className="lead">
        Historial aislado por conversation. El listado se obtiene vía workspaces
        HTTP existentes.
      </p>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => void newConversation()}
        >
          Nueva conversation
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void refreshConversations()}
        >
          Actualizar
        </button>
      </div>
      {bannerError ? <p className="error">{bannerError}</p> : null}
      {conversations.length === 0 ? (
        <p className="muted">No hay conversations todavía.</p>
      ) : (
        conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`conv-item${activeConversationId === c.id ? " active" : ""}`}
            onClick={() => void selectConversation(c.id)}
          >
            <strong>{c.title?.trim() || "Sin título"}</strong>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              {c.id.slice(0, 12)}… · {c.createdAt}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
