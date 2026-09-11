/**
 * Menú compacto «Nuevo proyecto» (popover desktop / sheet mobile).
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  NEW_PROJECT_OPTIONS,
  type MockProjectType,
} from "./mockProjects";

type Props = {
  onSelect: (type: MockProjectType) => void;
  collapsed?: boolean;
};

export function NewProjectMenu({ onSelect, collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(type: MockProjectType) {
    setOpen(false);
    onSelect(type);
  }

  const menu = (
    <div
      id={menuId}
      className={`np-menu ${isNarrow ? "is-sheet" : "is-popover"}`}
      role="menu"
      aria-label="Nuevo proyecto"
    >
      <p className="np-menu-title">Nuevo proyecto</p>
      <ul className="np-menu-list">
        {NEW_PROJECT_OPTIONS.map((opt) => (
          <li key={opt.type}>
            <button
              type="button"
              role="menuitem"
              className="np-menu-item"
              onClick={() => choose(opt.type)}
            >
              <strong>{opt.title}</strong>
              <span className="muted">{opt.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className={`np-root ${collapsed ? "is-collapsed" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="icon-btn sm np-plus"
        title="Nuevo proyecto"
        aria-label="Nuevo proyecto"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
      {open && isNarrow ? (
        <>
          <button
            type="button"
            className="np-sheet-backdrop"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          {menu}
        </>
      ) : null}
      {open && !isNarrow ? menu : null}
    </div>
  );
}
