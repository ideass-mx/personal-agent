import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
} from "../../lib/diagnostics";
import {
  applyComposerAutosize,
  COMPOSER_TEXTAREA_MIN_PX,
  composerEnterShouldSend,
} from "../../lib/composerKeyboard";
import { IconSend } from "../../components/icons";
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
    wsStatus,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [composerTall, setComposerTall] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner, busy]);

  const isBlank = messages.length === 0;
  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;
  const showThinkingPulse =
    busy &&
    !messages.some(
      (m) =>
        m.role === "assistant" &&
        m.streaming === true &&
        m.text.trim().length > 0,
    );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyComposerAutosize(el);
    setComposerTall(result.heightPx > COMPOSER_TEXTAREA_MIN_PX + 4);
  }, [draft, isBlank]);

  useEffect(() => {
    if (wsStatus !== "authenticated") return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(id);
  }, [wsStatus, isBlank, activeConversationId]);

  const composer = (
    <form
      className={`composer ${isBlank ? "composer-hero" : "composer-dock"} ${
        composerTall ? "is-expanded" : "is-compact"
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) send();
      }}
    >
      <div
        className={`composer-shell ${composerTall ? "is-tall" : "is-compact"}`}
      >
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const coarse =
              typeof window !== "undefined" &&
              window.matchMedia("(pointer: coarse)").matches;
            if (
              !composerEnterShouldSend({
                shiftKey: e.shiftKey,
                coarsePointer: coarse,
              })
            ) {
              return;
            }
            e.preventDefault();
            if (canSend) send();
          }}
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
          <IconSend size={18} className="composer-send-icon" />
        </button>
      </div>
    </form>
  );

  return (
    <div
      className={`conversation-screen ${isBlank ? "is-blank" : ""}`}
      data-agent="personal"
    >
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
        <div className="blank-state fade-in">
          <div className="blank-state-content">
            <p className="blank-heading">¿En qué te ayudo?</p>
            {composer}
          </div>
        </div>
      ) : (
        <>
          <div className="thread">
            <div className="thread-inner">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="msg user">
                    <p>{m.text}</p>
                  </div>
                ) : m.role === "assistant" ? (
                  <div key={m.id} className="msg agent" data-agent="personal">
                    <p>
                      {m.text}
                      {m.streaming && m.text.trim().length > 0 ? (
                        <span className="stream-caret" aria-hidden />
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="msg system muted">
                    <p>{m.text}</p>
                  </div>
                ),
              )}
              {showThinkingPulse ? (
                <div
                  className="msg agent thinking"
                  data-agent="personal"
                  aria-live="polite"
                  aria-label="Pensando"
                >
                  <span className="thinking-pulse" aria-hidden />
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          </div>
          {composer}
        </>
      )}
    </div>
  );
}
