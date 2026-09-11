/** Distancia al fondo (px) para seguir considerando “pegado abajo”. */
export const THREAD_STICK_BOTTOM_PX = 96;

export function isScrollNearBottom(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx: number = THREAD_STICK_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}
