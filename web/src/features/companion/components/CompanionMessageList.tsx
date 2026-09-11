import type { CompanionMessage } from "../types";

type Props = {
  messages: CompanionMessage[];
  onCardAction: (msg: CompanionMessage, action: string) => void;
  onAction: (msg: CompanionMessage) => void;
};

export function CompanionMessageList({
  messages,
  onCardAction,
  onAction,
}: Props) {
  return (
    <div className="cp-thread" role="log" aria-live="polite">
      {messages.map((m) => {
        const card = m.card;
        return (
          <article
            key={m.id}
            className={`cp-msg ${m.role === "user" ? "is-user" : "is-agent"}`}
          >
            {m.role === "agent" ? (
              <span className="cp-msg-label">Agente</span>
            ) : null}
            {m.text ? <p className="cp-msg-text">{m.text}</p> : null}

            {card?.kind === "attention" ? (
              <div className="cp-card cp-card-attention">
                <p className="cp-card-kicker">Necesita tu decisión</p>
                <strong>{card.title}</strong>
                <p className="muted">{card.body}</p>
                <div className="cp-card-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => onCardAction(m, card.primaryAction)}
                  >
                    {card.primaryLabel}
                  </button>
                  {card.secondaryLabel ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        onCardAction(m, card.secondaryAction || "dismiss")
                      }
                    >
                      {card.secondaryLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {card?.kind === "promote" ? (
              <div className="cp-card cp-card-promote">
                <p className="cp-card-kicker">Espacio de trabajo</p>
                <strong>
                  {card.reoffer
                    ? "Esto ya creció bastante"
                    : "¿Le damos un espacio?"}
                </strong>
                <p className="muted">
                  {card.reason ||
                    `Puedo seguir ayudándote aquí, o mover ${card.label} a su propio espacio.`}
                </p>
                <div className="cp-card-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => onCardAction(m, "accept")}
                  >
                    Darle un espacio
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onCardAction(m, "reject")}
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            ) : null}

            {m.action ? (
              <div className="cp-inline-action">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onAction(m)}
                >
                  {m.action.label}
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
