import { useCompanion } from "../CompanionContext";

export function BellRouter() {
  const {
    signals,
    notifOpen,
    setNotifOpen,
    openSignal,
    unreadMain,
  } = useCompanion();
  const unseen = signals.filter((s) => !s.seen).length + (unreadMain ? 1 : 0);

  return (
    <div className="cp-bell-wrap">
      <button
        type="button"
        className="icon-btn cp-bell"
        title="Señales"
        aria-label="Señales del agente"
        aria-expanded={notifOpen}
        onClick={() => setNotifOpen(!notifOpen)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unseen > 0 ? <span className="cp-bell-dot" aria-hidden /> : null}
      </button>
      {notifOpen ? (
        <div className="cp-bell-panel" role="dialog" aria-label="Señales recientes">
          <p className="cp-bell-title">Señales</p>
          <p className="muted cp-bell-hint">
            Apuntan al lugar donde vive el contenido — no guardan mensajes.
          </p>
          {signals.length === 0 ? (
            <p className="muted">Sin señales recientes.</p>
          ) : (
            <ul className="cp-bell-list">
              {signals.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`cp-bell-item ${s.seen ? "" : "is-new"}`}
                    onClick={() => openSignal(s.id)}
                  >
                    <strong>{s.text}</strong>
                    <span className="muted">{s.where}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
