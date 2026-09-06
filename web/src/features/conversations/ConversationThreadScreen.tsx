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
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner]);

  const meta = conversations.find((c) => c.id === activeConversationId);
  const isBlank = messages.length === 0;
  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;

  return (
    <div className="conversation-screen" data-agent="personal">
      {!isBlank ? (
        <header className="screen-header">
          <div>
            <h1>{meta?.title || "Conversación"}</h1>
            <p className="muted">
              {activeConversationId
                ? `ID ${activeConversationId.slice(0, 8)}…`
                : "Nueva conversación"}
              {meta?.workspaceId ? ` · espacio ${meta.workspaceId.slice(0, 8)}…` : ""}
            </p>
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
        <div className="blank-hero fade-in">
          <p className="agent-voice hero-voice">¿En qué te ayudo?</p>
          <p className="muted">
            El mismo hilo puede atravesar varias capacidades cuando el protocolo las exponga.
          </p>
        </div>
      ) : (
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
                <p>{m.text}{m.streaming ? "▍" : ""}</p>
              </div>
            ) : (
              <div key={m.id} className="msg system muted">
                <p>{m.text}</p>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        className={`composer ${isBlank ? "centered" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe un mensaje…"
          aria-label="Mensaje"
          disabled={wsStatus !== "authenticated"}
        />
        <button type="submit" className="btn btn-primary" disabled={!canSend}>
          Enviar
        </button>
      </form>
    </div>
  );
}
