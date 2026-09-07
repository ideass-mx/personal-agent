import { useEffect, useRef, useState } from "react";
import { conversationListLabel } from "../../lib/conversationLabel";
import { useApp } from "../../state/AppContext";
import type { ConversationMeta } from "../../types";

const SIDEBAR_LIMIT = 50;

/**
 * Lista de conversaciones del sidebar (PHASE 58.5):
 * secciones Fijadas / Conversaciones, menú ⋯ y confirmación de borrado.
 */
export function ConversationSidebarList() {
  const {
    conversations,
    selectConversation,
    activeConversationId,
    nav,
    setConversationPinned,
    removeConversation,
  } = useApp();

  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (menuRef.current && t && !menuRef.current.contains(t)) {
        setMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const visible = conversations.slice(0, SIDEBAR_LIMIT);
  const pinned = visible.filter((c) => c.pinned);
  const unpinned = visible.filter((c) => !c.pinned);
  const confirmTarget = confirmId
    ? conversations.find((c) => c.id === confirmId)
    : null;

  if (visible.length === 0) {
    return (
      <ul className="conv-list">
        <li className="muted" style={{ padding: "8px 10px", fontSize: 12.5 }}>
          Sin conversaciones aún
        </li>
      </ul>
    );
  }

  const renderRow = (c: ConversationMeta) => {
    const label = conversationListLabel(c);
    const fullTitle = c.title?.trim() || label;
    const active =
      nav === "conversation" && activeConversationId === c.id;
    const menuOpen = menuId === c.id;

    return (
      <li key={c.id} className={`conv-row ${active ? "active" : ""}`}>
        <button
          type="button"
          className={`nav-item listed conv-row-main ${active ? "active" : ""}`}
          onClick={() => void selectConversation(c.id)}
          title={fullTitle}
        >
          <span className="truncate">{label}</span>
          {c.pinned ? (
            <span className="conv-pin-glyph" aria-hidden title="Fijada">
              📌
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`conv-menu-btn ${menuOpen ? "open" : ""}`}
          aria-label="Más opciones"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuId(menuOpen ? null : c.id);
          }}
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="conv-menu" role="menu" ref={menuRef}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuId(null);
                void setConversationPinned(c.id, !c.pinned);
              }}
            >
              {c.pinned ? "Desfijar" : "Fijar"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenuId(null);
                setConfirmId(c.id);
              }}
            >
              Eliminar
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <div className="conv-list">
        {pinned.length > 0 ? (
          <div className="conv-section">
            <div className="conv-section-label">Fijadas</div>
            <ul>{pinned.map(renderRow)}</ul>
          </div>
        ) : null}
        <div className="conv-section">
          {pinned.length > 0 ? (
            <div className="conv-section-label">Conversaciones</div>
          ) : null}
          <ul>{unpinned.map(renderRow)}</ul>
        </div>
      </div>

      {confirmTarget ? (
        <div className="conv-confirm-backdrop" role="presentation">
          <div
            className="conv-confirm"
            role="alertdialog"
            aria-labelledby="conv-confirm-title"
            aria-describedby="conv-confirm-desc"
          >
            <h3 id="conv-confirm-title">Eliminar conversación</h3>
            <p id="conv-confirm-desc">
              ¿Quieres eliminar &quot;{conversationListLabel(confirmTarget)}
              &quot;?
            </p>
            <p className="muted conv-confirm-warn">
              Esta acción no se puede deshacer.
            </p>
            <div className="conv-confirm-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const id = confirmTarget.id;
                  setConfirmId(null);
                  void removeConversation(id);
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
