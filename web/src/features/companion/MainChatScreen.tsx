/**
 * Línea principal homologada — chat real (WS + inteligencia) con estructura §3.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { isScrollNearBottom } from "../../lib/threadScroll";
import {
  IconRailActivity,
  IconRailMemory,
  IconRailSend,
  IconRailSpark,
} from "../../components/railIcons";
import { useApp } from "../../state/AppContext";
import {
  isSafeHttpUrl,
  SourcesChip,
  SourcesPanel,
  sanitizeAssistantDisplayText,
  type AgentSource,
} from "../../sources";
import { ConversationIntelligencePicker } from "../configuration/ConversationIntelligencePicker";
import { useCompanion } from "./CompanionContext";

export function MainChatScreen() {
  const { workingCount, markMainRead, setCompanionNav } = useCompanion();
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
    selectConversation,
    newConversation,
    wsStatus,
    pendingConfirm,
    sourcesPanelMessageId,
    openSourcesPanel,
    closeSourcesPanel,
    sourcesPanelSources,
    session,
    userDisplayName,
    setNav,
  } = useApp();

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
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
  const bootstrapped = useRef(false);

  const initials = (userDisplayName?.trim() || "Tú")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    markMainRead();
  }, [markMainRead]);

  useEffect(() => {
    if (!session || wsStatus !== "authenticated") return;
    if (activeConversationId) {
      bootstrapped.current = true;
      return;
    }
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;
    void (async () => {
      if (conversations.length > 0) {
        const first = conversations[0];
        if (first && !cancelled) await selectConversation(first.id);
        return;
      }
      if (!cancelled) await newConversation();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session,
    wsStatus,
    activeConversationId,
    conversations,
    selectConversation,
    newConversation,
  ]);

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
    if (busyStartedRef.current == null) busyStartedRef.current = Date.now();
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
      setAssistantStallMs(
        changedAt == null ? Date.now() - start : Date.now() - changedAt,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, pendingConfirm, messages]);

  useEffect(() => {
    setSelectedSourceId(null);
  }, [sourcesPanelMessageId]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeConversationId]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "user") stickToBottomRef.current = true;
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, toolBanner, busy]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyComposerAutosize(el);
    setComposerTall(result.heightPx > COMPOSER_TEXTAREA_MIN_PX + 4);
  }, [draft]);

  useEffect(() => {
    if (wsStatus !== "authenticated") return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(id);
  }, [wsStatus, activeConversationId]);

  const canSend =
    wsStatus === "authenticated" && draft.trim().length > 0 && !busy;
  const hasAssistantTokens = messages.some(
    (m) => m.role === "assistant" && m.text.trim().length > 0,
  );
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

  const statusLine =
    wsStatus !== "authenticated"
      ? wsStatus === "connecting"
        ? "Conectando…"
        : "Sin conexión"
      : busy
        ? "Pensando…"
        : workingCount > 0
          ? `En línea · trabajando en ${workingCount} cosa${workingCount === 1 ? "" : "s"}`
          : "En línea";

  const openSource = useMemo(
    () => (source: AgentSource) => {
      if (!isSafeHttpUrl(source.url)) return;
      setSelectedSourceId(source.id);
      window.open(source.url, "_blank", "noopener,noreferrer");
    },
    [],
  );

  function syncComposerHeight(el: HTMLTextAreaElement) {
    const result = applyComposerAutosize(el);
    setComposerTall(result.heightPx > COMPOSER_TEXTAREA_MIN_PX + 4);
  }

  return (
    <div className={`chat ${panelOpen ? "has-sources" : ""}`} data-agent="personal">
      <header className="chat-head">
        <span className="brand-mark" style={{ width: 30, height: 30 }} aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chat-title">Companion</div>
          <div className={`chat-status ${wsStatus === "authenticated" ? "is-live" : ""}`}>
            <span className="pulse" aria-hidden />
            {statusLine}
          </div>
        </div>
        <button
          type="button"
          className="tool-btn"
          title="Activity"
          aria-label="Activity"
          onClick={() => {
            setCompanionNav("activity");
            setNav("activity");
          }}
        >
          <IconRailActivity size={17} />
        </button>
      </header>

      {toolBanner ? <div className="tool-banner chat-banner">{toolBanner}</div> : null}
      {bannerError ? (
        <div className="block-panel chat-banner">
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

      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          stickToBottomRef.current = isScrollNearBottom(e.currentTarget);
        }}
      >
        <div className={`chat-inner ${panelOpen ? "with-panel" : ""}`}>
          {messages.length > 0 ? (
            <div className="chat-day">Today</div>
          ) : (
            <div className="chat-empty">
              <p className="chat-empty-title">¿En qué te ayudo?</p>
              <p className="muted">
                Habla con tu compañero. Recuerda tu historial y conoce tus
                proyectos.
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg user">
                <span className="msg-av">{initials}</span>
                <div className="msg-body">
                  <div className="bubble">{m.text}</div>
                </div>
              </div>
            ) : m.role === "assistant" ? (
              <div key={m.id} className="msg agent">
                <span className="msg-av">
                  <span className="brand-mark sm" aria-hidden />
                </span>
                <div className="msg-body">
                  <div className="bubble">
                    {sanitizeAssistantDisplayText(m.text, {
                      stripFuentes: Boolean(m.sources && m.sources.length > 0),
                    })}
                    {m.streaming && m.text.trim().length > 0 ? (
                      <span className="stream-caret" aria-hidden />
                    ) : null}
                  </div>
                  {!m.streaming && m.sources && m.sources.length > 0 ? (
                    <SourcesChip
                      count={m.sources.length}
                      active={sourcesPanelMessageId === m.id}
                      onClick={() => openSourcesPanel(m.id)}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div key={m.id} className="msg agent">
                <span className="msg-av">
                  <span className="brand-mark sm" aria-hidden />
                </span>
                <div className="msg-body">
                  <div className="bubble muted">{m.text}</div>
                </div>
              </div>
            ),
          )}

          {showWorkingStatus ? (
            <div className="msg agent" aria-live="polite">
              <span className="msg-av">
                <span className="brand-mark sm" aria-hidden />
              </span>
              <div className="msg-body">
                {showThinkingPulse ? (
                  <div className="bubble typing" aria-label={workingLabel ?? "Trabajando"}>
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <div className="bubble muted">{workingLabel}</div>
                )}
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
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

      <div className="chat-composer">
        <div className="chat-composer-inner">
          <div className={`composer-box ${composerTall ? "is-tall" : ""}`}>
            <span className="cmd-spark">
              <IconRailSpark size={18} />
            </span>
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
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
              placeholder="Message your companion…"
              aria-label="Mensaje"
              disabled={wsStatus !== "authenticated"}
            />
            <ConversationIntelligencePicker />
            <button
              type="button"
              className={`cmd-send ${canSend ? "" : "dim"}`}
              disabled={!canSend}
              aria-label="Enviar"
              onClick={() => {
                if (canSend) send();
              }}
            >
              <IconRailSend size={18} />
            </button>
          </div>
          <div className="chat-scope">
            <IconRailMemory size={14} />
            Recuerda tu historial · conoce tus proyectos y archivos
          </div>
        </div>
      </div>
    </div>
  );
}
