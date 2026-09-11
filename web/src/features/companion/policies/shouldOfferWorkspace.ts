/**
 * Política de promoción a espacio — reemplazable por el modelo.
 */
import type { PromoteState } from "../types";

export type OfferDecision =
  | { offer: false }
  | { offer: true; reason?: string; reoffer?: boolean };

export function shouldOfferWorkspace(ctx: {
  promote: PromoteState;
  isStatusQuestion: boolean;
  isTopicTurn: boolean;
  materialHeavy: boolean;
}): OfferDecision {
  const { promote, isStatusQuestion, isTopicTurn, materialHeavy } = ctx;
  if (promote.workspaceId) return { offer: false };
  if (isStatusQuestion) return { offer: false };
  if (!isTopicTurn) return { offer: false };

  const mentions = promote.mentions;
  if (!promote.rejected) {
    if (mentions <= 1 || mentions >= 3) {
      return {
        offer: true,
        reason:
          mentions >= 3
            ? "Ya llevamos varias piezas del viaje aquí; ¿le doy su propio espacio?"
            : undefined,
      };
    }
    return { offer: false };
  }

  // Tras rechazo: solo si material claramente grande y no se reofreció.
  if (!promote.reoffered && (mentions >= 4 || materialHeavy)) {
    return {
      offer: true,
      reoffer: true,
      reason:
        "Ya tenemos varias opciones y un borrador de itinerario aquí; ¿le doy su propio espacio?",
    };
  }
  return { offer: false };
}

export function isTripTopic(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(viaje|jap[oó]n|tokio|osaka|itinerario|vuelos?|alojamiento|hoteles?)\b/.test(
      t,
    ) || /\bplan[eé]a(me|r)?\b.*\bviaje\b/.test(t)
  );
}

export function isTripStatusQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bc[oó]mo va (mi |el )?viaje\b/.test(t) ||
    /\bestado (del |de mi )?viaje\b/.test(t) ||
    /\bqu[eé] hay (del|de mi) viaje\b/.test(t)
  );
}

export function inferBookProject(text: string): boolean {
  return /libro|escribir.*ia|empleo/.test(text.toLowerCase());
}
