import type { AgentSource } from "./types";
import { SOURCE_TYPE_LABELS } from "./types";

type Props = {
  source: AgentSource;
  selected?: boolean;
  onOpen: (source: AgentSource) => void;
};

export function SourceCard({ source, selected, onOpen }: Props) {
  const typeLabel = source.sourceType
    ? SOURCE_TYPE_LABELS[source.sourceType]
    : undefined;
  return (
    <button
      type="button"
      className={`source-card ${selected ? "is-selected" : ""}`}
      onClick={() => onOpen(source)}
      aria-label={`Abrir ${source.title}`}
    >
      <span className="source-card-title">{source.title}</span>
      <span className="source-card-domain">{source.domain || source.url}</span>
      {typeLabel ? (
        <span className="source-type-badge">{typeLabel}</span>
      ) : null}
      {source.snippet ? (
        <span className="source-card-snippet">{source.snippet}</span>
      ) : null}
    </button>
  );
}
