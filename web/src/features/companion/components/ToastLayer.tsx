import { useCompanion } from "../CompanionContext";

export function ToastLayer() {
  const { toasts, dismissToast, setCompanionNav, openWorkspace, markMainRead } =
    useCompanion();

  if (toasts.length === 0) return null;

  return (
    <div className="cp-toasts" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="cp-toast"
          onClick={() => {
            if (t.target?.startsWith("workspace:")) {
              openWorkspace(t.target.slice("workspace:".length));
            } else if (t.target === "main") {
              setCompanionNav("chat");
              markMainRead();
            } else if (t.target === "tasks") {
              setCompanionNav("tasks");
            }
            dismissToast(t.id);
          }}
        >
          <span>{t.text}</span>
          <span className="muted">Abrir</span>
        </button>
      ))}
    </div>
  );
}
