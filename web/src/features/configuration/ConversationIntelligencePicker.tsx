/**
 * Selector de inteligencia en el compositor: solo esta conversación.
 * Solo lista inteligencias realmente activadas (Local instalado, Cloud
 * conectado, BYOK con API key) — Cloud no aparece “por defecto”.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveHttpBase } from "../../api/http";
import {
  fetchCloudAuthStatus,
  fetchIntelligenceStatus,
  type CloudAuthStatusDto,
  type IntelligenceConnectionDto,
  type IntelligenceStatusDto,
} from "../../api/setup";
import { useApp } from "../../state/AppContext";
import {
  humanModelLabel,
  modeIcon,
  modeTitle,
} from "./intelligenceLabels";
import { ProviderIcon } from "./ProviderIcon";

function isUsable(
  c: IntelligenceConnectionDto,
  snap: IntelligenceStatusDto | null,
  cloud: CloudAuthStatusDto | null,
): boolean {
  if (c.mode === "local") return Boolean(snap?.local.installed);
  if (c.mode === "personal-agent-cloud") {
    // Opcional como BYOK: solo si el usuario conectó Cloud.
    return Boolean(cloud?.connected || cloud?.sessionActive);
  }
  return Boolean(c.credentialConfigured);
}

function shortLabel(c: IntelligenceConnectionDto): string {
  if (c.mode === "local") return "Local";
  if (c.mode === "personal-agent-cloud") return "Cloud";
  return modeTitle(c.mode, c.displayName);
}

export function ConversationIntelligencePicker() {
  const {
    session,
    conversationIntelligenceId,
    setConversationIntelligenceId,
  } = useApp();
  const [snap, setSnap] = useState<IntelligenceStatusDto | null>(null);
  const [cloud, setCloud] = useState<CloudAuthStatusDto | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    const base = resolveHttpBase(session);
    let cancelled = false;
    const load = () => {
      void Promise.all([
        fetchIntelligenceStatus(base, session.token),
        fetchCloudAuthStatus(base, session.token).catch(() => null),
      ])
        .then(([s, cs]) => {
          if (cancelled) return;
          setSnap(s);
          setCloud(cs);
        })
        .catch(() => {
          if (cancelled) return;
          setSnap(null);
          setCloud(null);
        });
    };
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const options = useMemo(() => {
    if (!snap) return [] as IntelligenceConnectionDto[];
    return (snap.connections || []).filter((c) => isUsable(c, snap, cloud));
  }, [snap, cloud]);

  const selectedId =
    conversationIntelligenceId || snap?.active?.id || null;
  const selectedFromOptions = options.find((c) => c.id === selectedId);
  // Si la activa global no es usable (p.ej. Cloud sin sesión), caer a una opción real.
  const selected =
    selectedFromOptions ||
    (snap?.active && isUsable(snap.active, snap, cloud) ? snap.active : null) ||
    options[0] ||
    null;

  async function onPick(conn: IntelligenceConnectionDto) {
    if (!session || busy) return;
    setBusy(true);
    try {
      setConversationIntelligenceId(conn.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!selected && options.length === 0) return null;

  return (
    <div className="conv-intel-picker" ref={rootRef}>
      <button
        type="button"
        className="conv-intel-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Cómo piensa tu agente en esta conversación"
        disabled={busy || options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="conv-intel-pill-icon" aria-hidden="true">
          {selected?.mode === "external" ? (
            <ProviderIcon provider={selected.provider} size={18} />
          ) : selected?.mode === "local" ? (
            "🔒"
          ) : (
            "☁️"
          )}
        </span>
        <span>{selected ? shortLabel(selected) : "Inteligencia"}</span>
        <span className="conv-intel-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          className="conv-intel-menu"
          role="listbox"
          aria-label="Cómo piensa tu agente · solo esta conversación"
        >
          <p className="conv-intel-menu-kicker">
            Cómo piensa tu agente · solo esta conversación
          </p>
          <ul>
            {options.map((c) => {
              const active = c.id === selected?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`conv-intel-option${active ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => void onPick(c)}
                  >
                    <span className="conv-intel-option-icon" aria-hidden="true">
                      {c.mode === "external" ? (
                        <ProviderIcon provider={c.provider} size={22} />
                      ) : (
                        modeIcon(c.mode)
                      )}
                    </span>
                    <span className="conv-intel-option-text">
                      <strong>
                        {modeTitle(c.mode, c.displayName)}
                      </strong>
                      <span className="muted">
                        {humanModelLabel(c.provider, c.modelId)}
                      </span>
                    </span>
                    {active ? (
                      <span className="conv-intel-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
