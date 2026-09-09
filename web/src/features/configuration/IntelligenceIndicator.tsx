import { useEffect, useState } from "react";
import { resolveHttpBase } from "../../api/http";
import {
  fetchIntelligenceStatus,
  type IntelligenceConnectionDto,
} from "../../api/setup";
import { useApp } from "../../state/AppContext";
import {
  humanModelLabel,
  modeIcon,
  modeTitle,
} from "./intelligenceLabels";

/** Indicador discreto en el chat: inteligencia activa. */
export function IntelligenceIndicator() {
  const { session, openSettings } = useApp();
  const [active, setActive] = useState<IntelligenceConnectionDto | null>(null);

  useEffect(() => {
    if (!session) return;
    const base = resolveHttpBase(session);
    let cancelled = false;
    const load = () => {
      void fetchIntelligenceStatus(base, session.token)
        .then((s) => {
          if (!cancelled) setActive(s.active);
        })
        .catch(() => {
          if (!cancelled) setActive(null);
        });
    };
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [session]);

  if (!active) return null;

  const label = `${modeIcon(active.mode)} ${modeTitle(active.mode, active.displayName)}`;
  const model = humanModelLabel(active.provider, active.modelId);

  return (
    <button
      type="button"
      className="intel-indicator"
      title="Cambiar inteligencia"
      aria-label={`Inteligencia activa: ${label}, ${model}. Abrir configuración.`}
      onClick={() => openSettings("intelligence")}
    >
      <span className="intel-indicator-mode">{label}</span>
      <span className="intel-indicator-model muted">{model}</span>
    </button>
  );
}
