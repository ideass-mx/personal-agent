/**
 * Inferencia de estructura de proyecto — hoy heurística; mañana el modelo.
 */
import {
  kindLabel,
  sectionsForKind,
  type WorkspaceKind,
} from "../types";

export type ProjectInterpretation = {
  kind: WorkspaceKind;
  /** Etiqueta humana del kind. */
  label: string;
  objective: string;
  sections: string[];
};

function capitalizeSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Interpreta un objetivo en lenguaje natural.
 * El usuario nunca elige tipo: se infiere aquí.
 */
export function interpretProjectGoal(text: string): ProjectInterpretation {
  const raw = text.trim();
  if (!raw) {
    return {
      kind: "Generic",
      label: "Proyecto",
      objective: "",
      sections: sectionsForKind("Generic"),
    };
  }

  const t = raw.toLowerCase();
  let kind: WorkspaceKind = "Generic";

  if (/\b(libro|book)\b/.test(t) || /\bescribir un libro\b/.test(t)) {
    kind = "Book";
  } else if (
    /\b(paper|art[ií]culo|estudio|cient[ií]fico|productividad)\b/.test(t)
  ) {
    kind = "Paper";
  } else if (
    /\b(invertir|inversi[oó]n|acci[oó]n|finanzas|financier[oa]|portafolio|startup)\b/.test(
      t,
    )
  ) {
    kind = "Finance";
  } else if (
    /\b(software|arquitectura|app|construir|c[oó]digo|desarrollar)\b/.test(t)
  ) {
    kind = "Software";
  } else if (
    /\b(legal|regulaci[oó]n|ley|leyes|privacidad|jur[ií]dic)\b/.test(t)
  ) {
    kind = "Legal";
  } else if (/\b(viaje|trip|vacaciones|jap[oó]n)\b/.test(t)) {
    kind = "Travel";
  }

  return {
    kind,
    label: kindLabel(kind),
    objective: capitalizeSentence(raw),
    sections: sectionsForKind(kind),
  };
}
