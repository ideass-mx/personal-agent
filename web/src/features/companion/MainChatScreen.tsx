import { useEffect, useRef } from "react";
import { useCompanion } from "./CompanionContext";
import { CompanionMessageList } from "./components/CompanionMessageList";
import type { CompanionMessage } from "./types";

export function MainChatScreen() {
  const {
    mainMessages,
    draft,
    setDraft,
    sendMain,
    handleCardAction,
    typing,
    workingCount,
    openWorkspace,
    setCompanionNav,
    markMainRead,
  } = useCompanion();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    markMainRead();
  }, [markMainRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mainMessages, typing]);

  function onAction(msg: CompanionMessage) {
    if (!msg.action) return;
    if (msg.action.kind === "open" && msg.action.target) {
      openWorkspace(msg.action.target);
      return;
    }
    if (msg.action.kind === "tasks") {
      setCompanionNav("tasks");
      return;
    }
    if (msg.action.kind === "project") {
      setCompanionNav("projects");
    }
  }

  return (
    <div className="cp-chat screen" data-agent="personal">
      <header className="cp-chat-head">
        <div className="cp-presence">
          <span className="cp-breath" aria-hidden />
          <div>
            <h1>Agente</h1>
            <p className="muted">
              En línea
              {workingCount > 0
                ? ` · trabajando en ${workingCount} cosa${workingCount === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <CompanionMessageList
        messages={mainMessages}
        onCardAction={handleCardAction}
        onAction={onAction}
      />
      {typing ? (
        <p className="cp-typing muted" role="status">
          El agente está escribiendo…
        </p>
      ) : null}
      <div ref={endRef} />

      <form
        className="cp-composer"
        onSubmit={(e) => {
          e.preventDefault();
          sendMain();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Habla con el agente…"
          aria-label="Mensaje"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMain();
            }
          }}
        />
        <button type="submit" className="btn primary" disabled={!draft.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
