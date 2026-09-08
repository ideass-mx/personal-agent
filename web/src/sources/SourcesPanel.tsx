import { useEffect, useId, useRef } from "react";
import type { AgentSource } from "./types";
import { sourcesPanelTitle } from "./types";
import { SourceCard } from "./SourceCard";

type Props = {
  sources: readonly AgentSource[];
  onClose: () => void;
  onOpenSource: (source: AgentSource) => void;
  selectedSourceId?: string | null;
  /** bottom sheet en viewport estrecho */
  mobile?: boolean;
};

export function SourcesPanel({
  sources,
  onClose,
  onOpenSource,
  selectedSourceId,
  mobile,
}: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className={`sources-panel ${mobile ? "is-mobile" : ""}`}
      role="complementary"
      aria-labelledby={titleId}
    >
      <header className="sources-panel-header">
        <div>
          <h2 id={titleId} className="sources-panel-title">
            Fuentes
          </h2>
          <p className="sources-panel-count">{sourcesPanelTitle(sources.length)}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="sources-panel-close"
          onClick={onClose}
          aria-label="Cerrar fuentes"
        >
          ×
        </button>
      </header>
      <div className="sources-panel-list">
        {sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            selected={selectedSourceId === s.id}
            onOpen={onOpenSource}
          />
        ))}
      </div>
    </aside>
  );
}
