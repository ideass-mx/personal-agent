import { useEffect, useRef, useState } from "react";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
} from "../../lib/diagnostics";
import { deriveAgentStatus } from "../../lib/agentStatus";
import { DesktopBlock } from "../../structured/DesktopBlock";
import { useApp } from "../../state/AppContext";
import type { Block } from "../../types";

/** Espacio del agente: área adaptativa + conversación real (WS). */
export function AgentSpaceScreen() {
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
    pendingConfirm,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner]);

  const streaming = messages.some((m) => m.streaming);
  const agentState = deriveAgentStatus({
    wsStatus,
    agentReady: Boolean(health?.agentReady),
    busy,
    pendingConfirm: Boolean(pendingConfirm),
    hasError: Boolean(bannerError),
    streaming,
  });

  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;

  const isBlank = messages.length === 0;

  const statusBlocks: Block[] = [
    {
      type: "state",
      status: agentState.status,
      label: agentState.label,
      detail: agentState.detail,
    },
  ];

  return (
    <div className="workspace-split" data-agent="personal">
      <div className="workspace-main">
        <div className="workspace-inner">
          {isBlank ? (
            <div className="agent-hero fade-in">
              <DesktopBlock
                blocks={[
                  ...statusBlocks,
                  {
                    type: "text",
                    tone: "agent",
                    text: "¿En qué te ayudo?",
                  },
                  {
                    type: "text",
                    tone: "muted",
                    text: "Un solo Personal Agent. Las capacidades se activan dentro del trabajo — no son apps separadas.",
                  },
                ]}
              />
            </div>
          ) : (
            <div className="fade-in">
              <DesktopBlock blocks={statusBlocks} />
              {toolBanner ? <div className="tool-banner">{toolBanner}</div> : null}
              {bannerError ? (
                <div className="block-panel" style={{ marginTop: 12 }}>
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
              <div className="thread" style={{ marginTop: 16 }}>
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
                      <DesktopBlock
                        blocks={[
                          {
                            type: "text",
                            text: m.text + (m.streaming ? "▍" : ""),
                          },
                        ]}
                      />
                    </div>
                  ) : (
                    <div key={m.id} className="msg system muted">
                      <p>{m.text}</p>
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>
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
          {isBlank ? (
            <div className="row-actions" style={{ justifyContent: "center", marginTop: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => void newConversation()}>
                Nueva conversación
              </button>
              {activeConversationId ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  Hilo {activeConversationId.slice(0, 8)}…
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="context-chat">
        <header className="context-head">
          <strong>Estado</strong>
          <span className="muted">{agentState.label}</span>
        </header>
        <div className="context-messages">
          <div className="bubble agent">
            <p className="agent-voice" style={{ margin: 0 }}>
              {wsStatus === "authenticated"
                ? "Conectado al Gateway. Puedes hablar con el agente desde el compositor."
                : "Esperando conexión con el Agent Host…"}
            </p>
          </div>
          {health?.agentTools?.length ? (
            <div className="bubble user">
              Tools Node: {health.agentTools.slice(0, 6).join(", ")}
              {health.agentTools.length > 6 ? "…" : ""}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
