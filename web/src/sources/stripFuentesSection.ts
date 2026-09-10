/**
 * Quita la sección markdown «Fuentes» / «Sources» del cuerpo del mensaje.
 * Las fuentes estructuradas van en el chip/panel (PHASE 60.15.1).
 */
export function stripTrailingSourcesSection(text: string): string {
  const raw = text ?? "";
  if (!raw.trim()) return raw;

  const patterns = [
    // Opcional --- antes del encabezado Fuentes/Sources
    /\n+(?:[-*_ ]{3,}\s*\n+)?[ \t]*#{0,3}[ \t]*\*{0,2}[ \t]*Fuentes[ \t]*\*{0,2}[ \t]*:?[ \t]*\*{0,2}[ \t]*\n[\s\S]*$/i,
    /\n+(?:[-*_ ]{3,}\s*\n+)?[ \t]*#{0,3}[ \t]*\*{0,2}[ \t]*Sources[ \t]*\*{0,2}[ \t]*:?[ \t]*\*{0,2}[ \t]*\n[\s\S]*$/i,
  ];

  let out = raw;
  for (const re of patterns) {
    const next = out.replace(re, "");
    if (next !== out) {
      out = next;
      break;
    }
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
