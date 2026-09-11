import { useCompanion } from "../CompanionContext";

/** FAB en pantallas que no son chat/workspace. */
export function AskCompanionFab() {
  const { companionNav, setPaletteOpen } = useCompanion();
  if (companionNav === "chat" || companionNav === "workspace") return null;

  return (
    <button
      type="button"
      className="cp-ask-fab"
      onClick={() => {
        setPaletteOpen(true);
      }}
      title="Preguntar al compañero"
    >
      Preguntar al agente
    </button>
  );
}
