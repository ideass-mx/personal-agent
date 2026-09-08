import { sourcesChipLabel } from "./types";

type Props = {
  count: number;
  onClick?: () => void;
  active?: boolean;
};

/** Chip compacto bajo la respuesta del agente. */
export function SourcesChip({ count, onClick, active }: Props) {
  const label = sourcesChipLabel(count);
  if (!label) return null;
  return (
    <button
      type="button"
      className={`sources-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={`Ver ${label}`}
      aria-expanded={active ? true : undefined}
    >
      {label}
    </button>
  );
}
