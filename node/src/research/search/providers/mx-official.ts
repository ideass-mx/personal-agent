/**
 * Catálogo curado de fuentes oficiales MX (sin scraping).
 * Descubrimiento local por keywords → URLs institucionales conocidas.
 * No es un índice web; es directorio determinista para ES/MX official.
 */
import { buildPaResult, clampPaLimit } from "../normalize.ts";
import type {
  PaSearchProvider,
  PaSearchRequest,
  PaSearchResult,
  SourceType,
} from "../types.ts";

export type MxOfficialEntry = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly sourceType: SourceType;
  /** Tokens que deben aparecer (al menos `minHits`) en la query. */
  readonly keywords: readonly string[];
  readonly minHits?: number;
};

/** Catálogo pequeño y explicable — ampliar con evidencia, no con crawl masivo. */
export const MX_OFFICIAL_CATALOG: readonly MxOfficialEntry[] = [
  {
    id: "sat",
    title: "SAT — Servicio de Administración Tributaria",
    url: "https://www.sat.gob.mx/",
    snippet: "Portal oficial del SAT (declaraciones, RFC, trámites fiscales).",
    sourceType: "government",
    keywords: ["sat", "declaración", "declaracion", "rfc", "factura"],
    minHits: 1,
  },
  {
    id: "dof",
    title: "DOF — Diario Oficial de la Federación",
    url: "https://www.dof.gob.mx/",
    snippet: "Publicación oficial de leyes, decretos y normas en México.",
    sourceType: "government",
    keywords: ["dof", "diario oficial", "norma oficial"],
    minHits: 1,
  },
  {
    id: "banxico",
    title: "Banco de México (Banxico)",
    url: "https://www.banxico.org.mx/",
    snippet: "Banco central de México — política monetaria, inflación, tipo de cambio.",
    sourceType: "official",
    keywords: ["banxico", "inflación", "inflacion", "tipo de cambio", "tasa"],
    minHits: 1,
  },
  {
    id: "inegi",
    title: "INEGI — Instituto Nacional de Estadística y Geografía",
    url: "https://www.inegi.org.mx/",
    snippet: "Estadísticas oficiales de México (economía, población, censos).",
    sourceType: "government",
    keywords: ["inegi", "censo", "estadística", "estadistica", "inflación", "inflacion"],
    minHits: 1,
  },
  {
    id: "secihti",
    title: "SECIHTI — Secretaría de Ciencia, Humanidades, Tecnología e Innovación",
    url: "https://www.secihti.mx/",
    snippet: "Convocatorias y política científica de México (antes CONAHCYT).",
    sourceType: "government",
    keywords: ["secihti", "conahcyt", "conacyt", "convocatoria", "beca"],
    minHits: 1,
  },
  {
    id: "gobmx",
    title: "gob.mx — Portal del Gobierno de México",
    url: "https://www.gob.mx/",
    snippet: "Portal único de trámites e información del gobierno federal.",
    sourceType: "government",
    keywords: ["gob.mx", "gobierno de méxico", "gobierno de mexico", "trámite", "tramite"],
    minHits: 1,
  },
  {
    id: "uaq",
    title: "UAQ — Universidad Autónoma de Querétaro",
    url: "https://www.uaq.mx/",
    snippet: "Universidad pública de Querétaro — posgrados y doctorados.",
    sourceType: "university",
    keywords: ["uaq", "querétaro", "queretaro", "doctorado"],
    minHits: 2,
  },
  {
    id: "unam",
    title: "UNAM — Universidad Nacional Autónoma de México",
    url: "https://www.unam.mx/",
    snippet: "Principal universidad pública de México.",
    sourceType: "university",
    keywords: ["unam", "doctorado", "posgrado"],
    minHits: 1,
  },
  {
    id: "ipn",
    title: "IPN — Instituto Politécnico Nacional",
    url: "https://www.ipn.mx/",
    snippet: "Instituto público de educación superior en México.",
    sourceType: "university",
    keywords: ["ipn", "politécnico", "politecnico", "doctorado"],
    minHits: 1,
  },
  {
    id: "cinvestav",
    title: "CINVESTAV",
    url: "https://www.cinvestav.mx/",
    snippet: "Centro de Investigación y de Estudios Avanzados del IPN.",
    sourceType: "university",
    keywords: ["cinvestav", "doctorado", "investigación"],
    minHits: 1,
  },
];

export function matchMxOfficialCatalog(
  query: string,
  catalog: readonly MxOfficialEntry[] = MX_OFFICIAL_CATALOG,
): MxOfficialEntry[] {
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const scored: Array<{ entry: MxOfficialEntry; hits: number }> = [];
  for (const entry of catalog) {
    let hits = 0;
    for (const kw of entry.keywords) {
      const k = kw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (q.includes(k)) hits += 1;
    }
    const min = entry.minHits ?? 1;
    if (hits >= min) scored.push({ entry, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || a.entry.id.localeCompare(b.entry.id));
  return scored.map((s) => s.entry);
}

export function createMxOfficialProvider(): PaSearchProvider {
  return {
    id: "mx-official",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = clampPaLimit(request.limit);
      const matches = matchMxOfficialCatalog(request.query);
      const retrievedAt = new Date().toISOString();
      const out: PaSearchResult[] = [];
      for (const m of matches.slice(0, limit)) {
        const r = buildPaResult({
          title: m.title,
          url: m.url,
          snippet: m.snippet,
          provider: "mx-official",
          retrievedAt,
        });
        if (r) {
          // Forzar sourceType del catálogo (buildPaResult también clasifica por URL)
          out.push({ ...r, sourceType: m.sourceType });
        }
      }
      return out;
    },
  };
}
