/**
 * Enrutado invisible de intención — hoy heurística; mañana el modelo.
 */
import type { CompanionWorkspace, IntentRoute } from "../types";

export function routeIntent(
  text: string,
  _scope?: CompanionWorkspace | null,
): IntentRoute {
  const t = text.trim().toLowerCase();
  if (!t) return "chat";

  if (
    /^(apaga|enciende|abre|cierra|mute|silencia)\b/.test(t) ||
    /\b(volumen|brillo)\b/.test(t)
  ) {
    return "action";
  }

  if (
    /\b(recu[eé]rdame|recuerdame|av[ií]same|paga(r)?|llamar|compra(r)?|env[ií]a(r)?|vigila(r)?)\b/.test(
      t,
    ) ||
    /\b(el viernes|mañana|pasado mañana)\b/.test(t)
  ) {
    return "task";
  }

  if (
    /\b(quiero escribir (un )?libro|escribir un libro|art[ií]culo cient[ií]fico|investigar (a fondo|en profundidad)|analizar una inversi[oó]n|construir (una )?app|desarrollar (un )?software)\b/.test(
      t,
    ) ||
    /\b(nuevo proyecto|crear (un )?proyecto)\b/.test(t)
  ) {
    return "project";
  }

  return "chat";
}
