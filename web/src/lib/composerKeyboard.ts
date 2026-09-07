/**
 * Helpers de teclado / autosize del composer multilínea (PHASE 58.4).
 */

export const COMPOSER_TEXTAREA_MIN_PX = 54;
export const COMPOSER_TEXTAREA_MAX_PX = 240;

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
 * Crece al escribir y se reduce al borrar; overflow interno solo tras max-height.
 */
export function applyComposerAutosize(
  el: HTMLTextAreaElement,
  opts: { minPx?: number; maxPx?: number } = {},
): { heightPx: number; overflowY: "hidden" | "auto"; contentPx: number } {
  const minPx = opts.minPx ?? COMPOSER_TEXTAREA_MIN_PX;
  const maxPx = opts.maxPx ?? COMPOSER_TEXTAREA_MAX_PX;
  // Medir contenido real: reset temporal (permite shrink al borrar).
  el.style.overflowY = "hidden";
  el.style.height = "auto";
  const contentPx = el.scrollHeight;
  const heightPx = Math.min(Math.max(contentPx, minPx), maxPx);
  const overflowY: "hidden" | "auto" = contentPx > maxPx ? "auto" : "hidden";
  el.style.height = `${heightPx}px`;
  el.style.overflowY = overflowY;
  return { heightPx, overflowY, contentPx };
}
