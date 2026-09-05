import { useEffect, useRef, useState } from "react";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
} from "../../lib/diagnostics";
import { useApp } from "../../state/AppContext";

export function ChatScreen() {
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
    newConversation,
    wsStatus,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner]);

  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;

  return (
    <div className="chat-layout">
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div>
            <h1 style={{ marginBottom: 4 }}>Chat</h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {activeConversationId
                ? `Conversation ${activeConversationId.slice(0, 8)}…`
                : "Nueva conversación"}
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void newConversation()}>
            Nueva
          </button>
        </div>
        {toolBanner ? <div className="tool-banner">{toolBanner}</div> : null}
        {bannerError ? (
          <div className="panel" style={{ marginBottom: 12 }}>
            <p className="error" style={{ marginTop: 0 }}>{bannerError}</p>
            {bannerDiagnostic ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Código de diagnóstico: {bannerDiagnostic.diagnosticId}
                </p>
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowDetails((v) => !v)}
                  >
                    Ver detalles
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        buildDiagnosticClipboardText(
                          bannerDiagnostic,
                          health,
                        ),
                      )
                    }
                  >
                    Copiar diagnóstico
                  </button>
                </div>
                {showDetails ? (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#fafaf9",
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {formatDiagnosticDetails(bannerDiagnostic)}
                  </pre>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        <div className="messages">
          {messages.length === 0 ? (
            <div className="panel" style={{ border: "none", background: "transparent" }}>
              <h2>Good morning.</h2>
              <p className="lead">What would you like me to do?</p>
              <p className="muted">
                Agent ready · 6 capabilities available
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role}`}>
                {m.text}
                {m.streaming ? "▍" : ""}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            wsStatus === "authenticated"
              ? "Escribe un mensaje…"
              : "Sin conexión al Agent Host"
          }
          disabled={wsStatus !== "authenticated"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) send();
            }
          }}
        />
        <button
          type="button"
          className="btn primary"
          disabled={!canSend}
          onClick={send}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
