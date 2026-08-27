import { capabilityFor, labelForTool } from "../lib/capabilities";
import { sanitizeInputSummary } from "../lib/sanitize";
import { HITL_TIMEOUT_MS } from "../lib/toolActivity";
import { useApp } from "../state/AppContext";
import { useEffect, useState } from "react";

export function HitlModal() {
  const { pendingConfirm, respondConfirm } = useApp();
  const [left, setLeft] = useState(60);

  useEffect(() => {
    if (!pendingConfirm) return;
    const tick = () => {
      const s = Math.max(
        0,
        Math.ceil(
          (pendingConfirm.receivedAtMs + HITL_TIMEOUT_MS - Date.now()) / 1000,
        ),
      );
      setLeft(s);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => clearInterval(id);
  }, [pendingConfirm]);

  if (!pendingConfirm) return null;
  const cap = capabilityFor(pendingConfirm.toolName);
  const label = labelForTool(pendingConfirm.toolName);
  const summary = sanitizeInputSummary(pendingConfirm.input);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Autorización requerida</h2>
        <p className="muted">Capacidad</p>
        <p>
          <strong>{label}</strong>
        </p>
        {cap?.description ? (
          <>
            <p className="muted">Acción</p>
            <p>{cap.description}</p>
          </>
        ) : null}
        <p className="muted">Datos</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
          {summary}
        </pre>
        <p className="warn-line">
          Esta acción puede modificar información en tu PC.
        </p>
        {cap?.platformHint ? (
          <p className="muted">{cap.platformHint}</p>
        ) : null}
        <p className="muted">Expira en {left}s</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => respondConfirm(false)}>
            Rechazar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => respondConfirm(true)}
          >
            Aprobar
          </button>
        </div>
      </div>
    </div>
  );
}
