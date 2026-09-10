import { stripTrailingSourcesSection } from "./stripFuentesSection";
import { stripLeakedToolCallJson } from "./stripToolCallLeak";

/** Limpia texto del asistente antes de mostrar/persistir en UI. */
export function sanitizeAssistantDisplayText(
  text: string,
  opts?: { stripFuentes?: boolean },
): string {
  let out = stripLeakedToolCallJson(text ?? "");
  if (opts?.stripFuentes) {
    out = stripTrailingSourcesSection(out);
  }
  return out;
}
