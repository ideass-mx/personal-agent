/**
 * Helpers de teclado / autosize del composer multilínea (PHASE 58.6).
 * Shell pill ≈ 56px; textarea crece desde una línea real (~28px).
 */

export const COMPOSER_TEXTAREA_MIN_PX = 28;
export const COMPOSER_TEXTAREA_MAX_PX = 240;
/** Altura visual del composer vacío (pill). */
export const COMPOSER_SHELL_MIN_PX = 56;

/** Enter envía en desktop; Shift+Enter = nueva línea. En coarse/touch, Enter = nueva línea. */
export function composerEnterShouldSend(input: {
  shiftKey: boolean;
  coarsePointer?: boolean;
}): boolean {
  if (input.shiftKey) return false;
  if (input.coarsePointer) return false;
  return true;
}

/**
 * Autosize real vía scrollHeight.
 * Crece al escribir/pegar y se reduce al borrar; overflow interno solo tras max-height.
 *
 * Importante: resetear a 0px (no solo "auto") para que flex/layout no congelen
 * scrollHeight en el alto anterior.
 */
export function applyComposerAutosize(
  el: HTMLTextAreaElement,
  opts: { minPx?: number; maxPx?: number } = {},
): { heightPx: number; overflowY: "hidden" | "auto"; contentPx: number } {
  const minPx = opts.minPx ?? COMPOSER_TEXTAREA_MIN_PX;
  const maxPx = opts.maxPx ?? COMPOSER_TEXTAREA_MAX_PX;
  el.style.overflowY = "hidden";
  el.style.height = "0px";
  // Forzar reflow antes de leer scrollHeight.
  void el.offsetHeight;
  const contentPx = el.scrollHeight;
  const heightPx = Math.min(Math.max(contentPx, minPx), maxPx);
  const overflowY: "hidden" | "auto" = contentPx > maxPx ? "auto" : "hidden";
  el.style.height = `${heightPx}px`;
  el.style.overflowY = overflowY;
  return { heightPx, overflowY, contentPx };
}
