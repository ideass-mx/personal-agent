import { useState, type FormEvent } from "react";
import { resolveHttpBase } from "../../api/http";
import { updateIdentityName } from "../../api/identity";
import { useApp } from "../../state/AppContext";

/**
 * PHASE 58 — Primer arranque: pedir el nombre del usuario (users.name).
 * No muestra IDs técnicos ni secretos.
 */
export function ProfileNameScreen({
  onCompleted,
}: {
  onCompleted: () => void;
}) {
  const { session, setUserDisplayName } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Indica cómo te llamas.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const base = resolveHttpBase(session);
      const user = await updateIdentityName(base, session.token, trimmed);
      setUserDisplayName(user.name);
      onCompleted();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos guardar tu nombre. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-center">
      <div className="panel fade-in" style={{ maxWidth: 420 }}>
        <h1>¿Cómo quieres que te llame?</h1>
        <p className="lead">
          Así te reconocerá el agente. Puedes cambiarlo después en configuración.
        </p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label className="field">
            <span>Tu nombre</span>
            <input
              type="text"
              autoFocus
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo, Enrique"
              disabled={busy}
            />
          </label>
          {err ? <p className="err">{err}</p> : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !name.trim()}
          >
            {busy ? "Guardando…" : "Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}
