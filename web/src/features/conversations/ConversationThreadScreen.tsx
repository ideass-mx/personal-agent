import { useEffect, useRef, useState } from "react";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
} from "../../lib/diagnostics";
import { useApp } from "../../state/AppContext";

/** Hilo a pantalla completa — conversación real vía Gateway WS/HTTP. */
export function ConversationScreen() {
  const {
    messages,
    draft,
    setDraft,
    send,
    busy,
    toolBanner,
    bannerError,
    bannerDiagnostic,
    health,
    activeConversationId,
    conversations,
    wsStatus,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner]);

  const meta = conversations.find((c) => c.id === activeConversationId);
  const isBlank = messages.length === 0;
  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;

  // Autofocus only on main blank agent surface (no modal/onboarding here).
  useEffect(() => {
    if (wsStatus !== "authenticated") return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(id);
  }, [wsStatus, isBlank, activeConversationId]);

  const composer = (
    <form
      className={`composer ${isBlank ? "composer-hero" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) send();
      }}
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Escribe lo que necesitas…"
        aria-label="Mensaje"
        disabled={wsStatus !== "authenticated"}
        autoComplete="off"
      />
      <button
        type="submit"
        className="btn btn-primary composer-send"
        disabled={!canSend}
        aria-label="Enviar"
      >
        ➤
      </button>
    </form>
  );

  return (
    <div
      className={`conversation-screen ${isBlank ? "is-blank" : ""}`}
      data-agent="personal"
    >
      {!isBlank ? (
        <header className="screen-header">
          <div>
            <h1>{meta?.title || "Conversación"}</h1>
            {meta?.summary ? <p className="muted">{meta.summary}</p> : null}
          </div>
        </header>
      ) : null}

      {toolBanner ? <div className="tool-banner">{toolBanner}</div> : null}
      {bannerError ? (
        <div className="block-panel" style={{ marginBottom: 12 }}>
          <p className="error" style={{ marginTop: 0 }}>
            {bannerError}
          </p>
          {bannerDiagnostic ? (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowDetails((v) => !v)}
              >
                Ver detalles
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    buildDiagnosticClipboardText(bannerDiagnostic, health),
                  )
                }
              >
                Copiar diagnóstico
              </button>
            </div>
          ) : null}
          {showDetails && bannerDiagnostic ? (
            <pre className="diag-pre">{formatDiagnosticDetails(bannerDiagnostic)}</pre>
          ) : null}
        </div>
      ) : null}

      {isBlank ? (
        <div className="blank-stage fade-in">
          <p className="agent-voice hero-voice">¿En qué te ayudo?</p>
          {composer}
        </div>
      ) : (
        <>
          <div className="thread">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg user">
                  <p>{m.text}</p>
                </div>
              ) : m.role === "assistant" ? (
                <div key={m.id} className="msg agent" data-agent="personal">
                  <span className="cap-chip" data-agent="personal">
                    Personal
                  </span>
                  <p>
                    {m.text}
                    {m.streaming ? "▍" : ""}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="msg system muted">
                  <p>{m.text}</p>
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
          {composer}
        </>
      )}
    </div>
  );
}
