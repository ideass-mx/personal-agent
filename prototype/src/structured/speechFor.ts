import type { Block } from "../types";
import { AGENT_STATUS_LABELS, CAPABILITY_LABELS } from "../types";

/** Preparado para canal de voz: convierte bloques a texto hablable. */
export function speechFor(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "text":
        parts.push(b.text);
        break;
      case "state":
        parts.push(`${b.label}. ${b.detail ?? AGENT_STATUS_LABELS[b.status]}`);
        break;
      case "stat":
        parts.push(`${b.label}: ${b.value}${b.delta ? `, ${b.delta}` : ""}`);
        break;
      case "statGroup":
        parts.push(speechFor(b.stats));
        break;
      case "list":
        parts.push(
          `${b.title ?? "Lista"}: ${b.items.map((i) => i.text).join("; ")}`,
        );
        break;
      case "cards":
        parts.push(
          `${b.title ?? "Tarjetas"}: ${b.cards.map((c) => c.title).join(", ")}`,
        );
        break;
      case "table":
        parts.push(`${b.title ?? "Tabla"} con ${b.rows.length} filas.`);
        break;
      case "chart":
        parts.push(`Gráfico ${b.kind}${b.title ? `: ${b.title}` : ""}.`);
        break;
      case "progress":
        parts.push(`${b.label}: ${b.value}${b.max ? ` de ${b.max}` : "%"}.`);
        break;
      case "timeline":
        parts.push(
          `${b.title ?? "Progreso"}: ${b.items.map((i) => i.title).join(", ")}`,
        );
        break;
      case "comparison":
        parts.push(
          `Comparación entre ${b.left.title} y ${b.right.title}.`,
        );
        break;
      case "approval":
        parts.push(
          `Necesito tu aprobación: ${b.title}. ${b.summary}`,
        );
        break;
      case "confirmation":
        parts.push(`${b.title}. ${b.message}`);
        break;
      case "files":
        parts.push(
          `${b.title ?? "Archivos"}: ${b.files.map((f) => f.name).join(", ")}`,
        );
        break;
      case "artifact":
        parts.push(`Artefacto ${b.kind}: ${b.title}.`);
        break;
      case "suggestion":
        parts.push(`${b.title}. ${b.body}`);
        break;
      case "card":
        parts.push(`${b.title}${b.body ? `. ${b.body}` : ""}`);
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join(" ");
}

export function capabilitySpeechHint(capability: keyof typeof CAPABILITY_LABELS) {
  return CAPABILITY_LABELS[capability];
}
