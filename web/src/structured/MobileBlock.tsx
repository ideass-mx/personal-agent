import type { Block } from "../types";
import { speechFor } from "./speechFor";

/**
 * Canal móvil preparado: compacta Block[] a lista táctil + texto hablable.
 * No es la superficie principal; se reutiliza cuando haya layout mobile.
 */
export function MobileBlock({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mobile-blocks fade-in">
      <p className="mobile-speech">{speechFor(blocks)}</p>
      <ul className="mobile-list">
        {blocks.map((b, i) => (
          <li key={b.id ?? `${b.type}-${i}`} className="mobile-item">
            <span className="mobile-type">{b.type}</span>
            <span className="mobile-summary">{b.type === "text" ? b.text : b.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
