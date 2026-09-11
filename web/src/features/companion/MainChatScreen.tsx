/**
 * Línea principal: chat real vía Gateway (inteligencia instalada) + chrome companion.
 */
import { useEffect } from "react";
import { ConversationScreen } from "../conversations/ConversationThreadScreen";
import { useApp } from "../../state/AppContext";
import { useCompanion } from "./CompanionContext";

export function MainChatScreen() {
  const {
    workingCount,
    markMainRead,
    unreadMain,
  } = useCompanion();
  const {
    wsStatus,
    activeConversationId,
    conversations,
    selectConversation,
    newConversation,
    busy,
    session,
  } = useApp();

  useEffect(() => {
    markMainRead();
  }, [markMainRead]);

  // Una línea principal: reutilizar la conversación más reciente o crear una.
  useEffect(() => {
    if (!session || wsStatus !== "authenticated") return;
    if (activeConversationId) return;
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

  const statusLabel =
    wsStatus === "authenticated"
      ? busy
        ? "Pensando…"
        : workingCount > 0
          ? `En línea · trabajando en ${workingCount} cosa${workingCount === 1 ? "" : "s"}`
          : "En línea"
      : wsStatus === "connecting"
        ? "Conectando…"
        : "Sin conexión";

  return (
    <div className="cp-chat" data-agent="personal">
      <header className="cp-chat-head">
        <div className="cp-presence">
          <span
            className={`cp-breath ${wsStatus === "authenticated" ? "is-live" : "is-off"}`}
            aria-hidden
          />
          <div>
            <h1>Agente</h1>
            <p className="muted">
              {statusLabel}
              {unreadMain ? " · mensaje nuevo" : ""}
            </p>
          </div>
        </div>
      </header>
      <div className="cp-live-chat">
        <ConversationScreen />
      </div>
    </div>
  );
}
