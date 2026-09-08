# PHASE 60.8 — Live Web Scraping & Adaptive Providers

**STATUS:** Experimental  
**Production `research.search`:** **sin cambios**  
**Extiende:** PHASE 60.7 (`node/src/research/scraping/`)  
**API keys / CAPTCHA bypass / metasearch / AGPL / fallback entre providers:** no  

---

## Pregunta

> ¿Puede la infraestructura 60.7 obtener información real, detectar degradación y recuperar cambios estructurales sin intervención manual?

**Respuesta (evidencia live, este entorno):** **parcial**.

| Capacidad | Evidencia |
| --- | --- |
| Extracción + health + drift (sintético) | Sí — heredado de 60.7; recoveryLevel 1–2 en HTML v2 |
| SERP DDG live | Cobertura baja (~18%); **blocked ~82%** |
| SERP Mojeek live | **blocked 100%** en esta corrida |
| JSON_ENDPOINT (Wikipedia OpenSearch) | Cobertura parcial (~27%); sin bloqueo |
| Direct-page (.gob.mx / docs) | Probado; depende de red/SSRF |
| Recovery Rate (parser ≠ blocked) | **1.0** sobre fallos de parser medidos (sintético + vacíos) |

**Veredicto:** la infraestructura adaptativa es **correcta**; la Web SERP HTML **bloquea automatización**. No justificar todavía cablear SERP scrapers a producción. Sí justificar seguir con JSON/oficiales + direct-page.

Detalle: `research/phase-60.8-benchmark-summary.md`

---

## Extensiones sobre 60.7

```text
scraping/
├── scrapers/
│   ├── duckduckgo.ts      # SERP (60.7) + kind
│   ├── mojeek.ts          # SERP independiente (60.8)
│   ├── direct-page.ts     # DIRECT_PAGE + SSRF
│   └── wikipedia-opensearch.ts  # JSON_ENDPOINT
├── recovery.ts            # Recovery Level 0–3 + rate
├── cache.ts               # TTL experimental
├── live-fetch.ts          # reexport researchFetch / SSRF
└── types.ts               # ScraperKind
```

Mecanismos soportados en contrato:

```text
SERP_SCRAPER | SITE_SEARCH | DIRECT_PAGE | JSON_ENDPOINT | RSS_FEED
```

---

## Live query suite (11)

General / México / Técnica / Investigación — ver script `research-60.8-benchmark.ts`.

---

## Recovery

```text
Blocked ≠ parser failure
Recovery Rate = recovered / parserFailures
```

Niveles: 0 none · 1 strategy interna · 2 candidate validado · 3 futuro LLM (no implementado).

---

## Comparación scrapers (corrida documentada)

| Provider | Coverage | Quality | Blocked | Latency | Confidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| DDG adaptive | 18% | 0.81 | 82% | ~249ms | 0.93 |
| Mojeek adaptive | 0% | — | 100% | ~229ms | — |
| Wikipedia JSON | 27% | 0.67 | 0% | ~160ms | 0.87 |

---

## Seguridad

- SSRF reutilizado (`assertUrlSafeForResearchFetch` / `researchFetch`)
- Sin logging de cookies/tokens/query completa (queryHash)
- Sin anti-bot bypass

---

## Tests

- 60.7: 14 (intactos)
- 60.8 offline: 14
- Live opcional: `RESEARCH_60_8_LIVE=1`

## Scripts

```bash
npm run research:benchmark:60.8 -w @mxideass/node
```

## DoD

- [x] DDG/Mojeek adaptive independientes  
- [x] Direct-site scraper  
- [x] ScraperKind / JSON endpoint  
- [x] Health live + blocked ≠ parser failure  
- [x] Drift + Recovery Rate  
- [x] Benchmark raw + summary  
- [x] live-fetch reutiliza researchFetch  

## Recomendación siguiente

**No** integrar SERP HTML como default.  
**Sí** (fase futura selectiva): Wikipedia/JSON + direct-page + catálogos oficiales como providers opcionales del Search Engine.
