import { DesktopBlock } from "../structured/DesktopBlock";
import { useApp } from "../state/AppState";
import { CAPABILITY_LABELS } from "../types";

export function ConversationScreen() {
  const {
    nav,
    conversations,
    messages,
    draftText,
    setDraftText,
    sendMessage,
    projects,
  } = useApp();

  if (nav.screen !== "conversation") return null;
  const conversation = conversations.find((c) => c.id === nav.conversationId);
  if (!conversation) return null;

  const thread = messages.filter((m) => m.conversationId === conversation.id);
  const isBlank = thread.length === 0;
  const project = conversation.projectId
    ? projects.find((p) => p.id === conversation.projectId)
    : null;

  return (
    <div className="conversation-screen" data-agent="personal">
      {!isBlank ? (
        <header className="screen-header">
          <div>
            <h1>{conversation.title}</h1>
            <p className="muted">
              {project ? project.name : "Suelto"} · actualizado {conversation.updatedAt}
            </p>
          </div>
        </header>
      ) : null}

      {isBlank ? (
        <div className="blank-hero fade-in">
          <p className="agent-voice hero-voice">¿En qué te ayudo?</p>
          <p className="muted">
            Un mismo hilo puede pasar por varias capacidades. El agente responde según el turno.
          </p>
          <Composer
            value={draftText}
            onChange={setDraftText}
            onSend={() => sendMessage(conversation.id, draftText)}
            centered
          />
        </div>
      ) : (
        <>
          <div className="thread">
            {thread.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg user fade-in">
                  <p>{m.text}</p>
                  <time>{m.createdAt}</time>
                </div>
              ) : (
                <div key={m.id} className="msg agent fade-in" data-agent={m.capability ?? "personal"}>
                  {m.capability ? (
                    <span className="cap-chip" data-agent={m.capability}>
                      {CAPABILITY_LABELS[m.capability]}
                    </span>
                  ) : null}
                  {m.text ? (
                    <p className={m.capability ? undefined : "agent-voice"}>{m.text}</p>
                  ) : null}
                  {m.blocks ? <DesktopBlock blocks={m.blocks} /> : null}
                  <time>{m.createdAt}</time>
                </div>
              ),
            )}
          </div>
          <Composer
            value={draftText}
            onChange={setDraftText}
            onSend={() => sendMessage(conversation.id, draftText)}
          />
        </>
      )}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  centered,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  centered?: boolean;
}) {
  return (
    <form
      className={`composer ${centered ? "centered" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe un mensaje…"
        aria-label="Mensaje"
      />
      <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
        Enviar
      </button>
    </form>
  );
}
