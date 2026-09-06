import type { Block } from "../types";
import { CAPABILITY_LABELS } from "../types";
import { speechFor } from "./speechFor";

/**
 * Renderer móvil preparado: compacta bloques a una lista táctil.
 * El foco del prototipo es DesktopBlock; este canal queda listo.
 */
export function MobileBlock({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mobile-blocks fade-in">
      <p className="mobile-speech">{speechFor(blocks)}</p>
      <ul className="mobile-list">
        {blocks.map((b, i) => (
          <li key={b.id ?? `${b.type}-${i}`} className="mobile-item">
            <span className="mobile-type">{b.type}</span>
            <span className="mobile-summary">{summarize(b)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function summarize(b: Block): string {
  switch (b.type) {
    case "text":
      return b.text;
    case "state":
      return b.label;
    case "stat":
      return `${b.label} ${b.value}`;
    case "statGroup":
      return `${b.stats.length} métricas`;
    case "list":
      return b.title ?? `${b.items.length} ítems`;
    case "cards":
      return b.title ?? `${b.cards.length} tarjetas`;
    case "table":
      return b.title ?? "Tabla";
    case "chart":
      return b.title ?? b.kind;
    case "progress":
      return `${b.label} ${b.value}%`;
    case "timeline":
      return b.title ?? "Línea de tiempo";
    case "comparison":
      return b.title ?? "Comparación";
    case "approval":
      return b.title;
    case "confirmation":
      return b.title;
    case "files":
      return `${b.files.length} archivos`;
    case "artifact":
      return b.title;
    case "suggestion":
      return b.title;
    case "card":
      return b.title;
    default:
      return "";
  }
}

export function MobileCapabilityChip({
  capability,
}: {
  capability: keyof typeof CAPABILITY_LABELS;
}) {
  return (
    <span className="cap-chip" data-agent={capability}>
      {CAPABILITY_LABELS[capability]}
    </span>
  );
}
