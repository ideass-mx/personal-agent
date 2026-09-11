import { IconRailBell } from "../../../components/railIcons";
import { useCompanion } from "../CompanionContext";

export function BellRouter() {
  const { signals, notifOpen, setNotifOpen, openSignal, unreadMain } =
    useCompanion();
  const unseen = signals.filter((s) => !s.seen).length + (unreadMain ? 1 : 0);

  return (
    <div className="cp-bell-wrap">
      <button
        type="button"
        className="rail-bell"
        title="Señales"
        aria-label="Señales del agente"
        aria-expanded={notifOpen}
        onClick={() => setNotifOpen(!notifOpen)}
      >
        <IconRailBell size={17} />
        {unseen > 0 ? <span className="nd" aria-hidden /> : null}
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
