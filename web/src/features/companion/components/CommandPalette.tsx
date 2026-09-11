import { useEffect, useRef } from "react";
import { useCompanion } from "../CompanionContext";
import { routeIntent } from "../policies/routeIntent";

export function CommandPalette() {
  const {
    paletteOpen,
    setPaletteOpen,
    sendMain,
    startCreateProject,
    setCompanionNav,
    openWorkspace,
    workspaces,
  } = useCompanion();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) inputRef.current?.focus();
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  function run(text: string) {
    const t = text.trim();
    if (!t) return;
    setPaletteOpen(false);
    const intent = routeIntent(t);
    if (intent === "project") {
      startCreateProject(t);
      return;
    }
    setCompanionNav("chat");
    sendMain(t);
  }

  return (
    <div className="cp-palette-root">
      <button
        type="button"
        className="cp-palette-backdrop"
        aria-label="Cerrar"
        onClick={() => setPaletteOpen(false)}
      />
      <div className="cp-palette" role="dialog" aria-label="Comando">
        <p className="cp-palette-kicker">Comando · ⌘K</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(inputRef.current?.value || "");
          }}
        >
          <input
            ref={inputRef}
            placeholder="Pídele algo al agente…"
            aria-label="Comando"
          />
        </form>
        <ul className="cp-palette-shortcuts">
          <li>
            <button type="button" onClick={() => { setPaletteOpen(false); setCompanionNav("chat"); }}>
              Ir al chat
            </button>
          </li>
          <li>
            <button type="button" onClick={() => { setPaletteOpen(false); startCreateProject(); }}>
              Nuevo proyecto
            </button>
          </li>
          <li>
            <button type="button" onClick={() => { setPaletteOpen(false); setCompanionNav("tasks"); }}>
              Tasks
            </button>
          </li>
          {workspaces.slice(0, 3).map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => {
                  setPaletteOpen(false);
                  openWorkspace(w.id);
                }}
              >
                Abrir {w.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
