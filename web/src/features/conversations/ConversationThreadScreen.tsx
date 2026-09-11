import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
} from "../../lib/diagnostics";
import {
  applyComposerAutosize,
  COMPOSER_TEXTAREA_MIN_PX,
  composerEnterShouldSend,
} from "../../lib/composerKeyboard";
import { workingPatienceLabel } from "../../lib/toolActivity";
import { IconSend } from "../../components/icons";
import { useApp } from "../../state/AppContext";
import {
  isSafeHttpUrl,
  SourcesChip,
  SourcesPanel,
  sanitizeAssistantDisplayText,
  type AgentSource,
} from "../../sources";
import { ConversationIntelligencePicker } from "../configuration/ConversationIntelligencePicker";

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
    pendingConfirm,
    sourcesPanelMessageId,
    openSourcesPanel,
    closeSourcesPanel,
    sourcesPanelSources,
  } = useApp();
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [composerTall, setComposerTall] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [busyMs, setBusyMs] = useState(0);
  const busyStartedRef = useRef<number | null>(null);
  const [assistantStallMs, setAssistantStallMs] = useState(0);
  const lastAssistantTextRef = useRef("");
  const lastAssistantChangeRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!busy || pendingConfirm) {
      busyStartedRef.current = null;
      setBusyMs(0);
      lastAssistantTextRef.current = "";
      lastAssistantChangeRef.current = null;
      setAssistantStallMs(0);
      return;
    }
    if (busyStartedRef.current == null) {
      busyStartedRef.current = Date.now();
    }
    const tick = () => {
      const start = busyStartedRef.current;
      if (start == null) return;
      setBusyMs(Date.now() - start);
      const assistantText = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.text)
        .join("\0");
      if (assistantText !== lastAssistantTextRef.current) {
        lastAssistantTextRef.current = assistantText;
        lastAssistantChangeRef.current = Date.now();
        setAssistantStallMs(0);
        return;
      }
      const changedAt = lastAssistantChangeRef.current;
      setAssistantStallMs(changedAt == null ? Date.now() - start : Date.now() - changedAt);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, pendingConfirm, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolBanner, busy, busyMs, assistantStallMs]);

  useEffect(() => {
    setSelectedSourceId(null);
  }, [sourcesPanelMessageId]);

  const isBlank = messages.length === 0;
  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;
  const hasAssistantTokens = messages.some(
    (m) => m.role === "assistant" && m.text.trim().length > 0,
  );
  // Heurística solo si aún no hay señal precisa (tool_progress / HITL).
  const showWorkingStatus =
    busy &&
    !pendingConfirm &&
    !toolBanner &&
    (!hasAssistantTokens || assistantStallMs >= 2_500);
  const workingLabel = showWorkingStatus
    ? workingPatienceLabel({ busyMs, hasAssistantTokens })
    : null;
  const showThinkingPulse = showWorkingStatus && !hasAssistantTokens;

  const panelOpen = Boolean(
    sourcesPanelMessageId && sourcesPanelSources.length > 0,
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyComposerAutosize(el);
    setComposerTall(result.heightPx > COMPOSER_TEXTAREA_MIN_PX + 4);
  }, [draft, isBlank]);

  function syncComposerHeight(el: HTMLTextAreaElement) {
    const result = applyComposerAutosize(el);
    setComposerTall(result.heightPx > COMPOSER_TEXTAREA_MIN_PX + 4);
  }

  useEffect(() => {
    if (wsStatus !== "authenticated") return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(id);
  }, [wsStatus, isBlank, activeConversationId]);

  const openSource = useMemo(
    () => (source: AgentSource) => {
      if (!isSafeHttpUrl(source.url)) return;
      setSelectedSourceId(source.id);
      window.open(source.url, "_blank", "noopener,noreferrer");
    },
    [],
  );

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
          onInput={(e) => syncComposerHeight(e.currentTarget)}
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
          placeholder="Escribe a tu agente…"
          aria-label="Mensaje"
          disabled={wsStatus !== "authenticated"}
          autoComplete="off"
        />
        <div className="composer-toolbar">
          <ConversationIntelligencePicker />
          <button
            type="submit"
            className="btn btn-primary composer-send"
            disabled={!canSend}
            aria-label="Enviar"
          >
            <IconSend size={18} className="composer-send-icon" />
          </button>
        </div>
      </div>
    </form>
  );

  const thread = (
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
                  {sanitizeAssistantDisplayText(m.text, {
                    stripFuentes: Boolean(m.sources && m.sources.length > 0),
                  })}
                  {m.streaming && m.text.trim().length > 0 ? (
                    <span className="stream-caret" aria-hidden />
                  ) : null}
                </p>
                {!m.streaming && m.sources && m.sources.length > 0 ? (
                  <SourcesChip
                    count={m.sources.length}
                    active={sourcesPanelMessageId === m.id}
                    onClick={() => openSourcesPanel(m.id)}
                  />
                ) : null}
              </div>
            ) : (
              <div key={m.id} className="msg system muted">
                <p>{m.text}</p>
              </div>
            ),
          )}
          {showWorkingStatus ? (
            <div
              className={`msg agent thinking${showThinkingPulse ? "" : " is-followup"}`}
              data-agent="personal"
              aria-live="polite"
              aria-label={workingLabel ?? "Trabajando"}
            >
              {showThinkingPulse ? (
                <span className="thinking-pulse" aria-hidden />
              ) : null}
              <span className="thinking-label">{workingLabel}</span>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>
      {composer}
    </>
  );

  return (
    <div
      className={`conversation-screen ${isBlank ? "is-blank" : ""} ${
        panelOpen ? "has-sources-panel" : ""
      }`}
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
            <p className="muted conv-intel-hint">
              El selector del compositor cambia cómo piensa tu agente aquí. Solo
              afecta a esta conversación; tu predeterminada no cambia.
            </p>
          </div>
        </div>
      ) : (
        <div className={`conversation-split ${panelOpen ? "is-open" : ""}`}>
          <div className="conversation-main">
            {thread}
          </div>
          {panelOpen ? (
            <>
              {isNarrow ? (
                <button
                  type="button"
                  className="sources-backdrop"
                  aria-label="Cerrar fuentes"
                  onClick={closeSourcesPanel}
                />
              ) : null}
              <SourcesPanel
                sources={sourcesPanelSources}
                onClose={closeSourcesPanel}
                onOpenSource={openSource}
                selectedSourceId={selectedSourceId}
                mobile={isNarrow}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
