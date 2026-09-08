# PHASE 60.7 — Independent Adaptive Scraping Infrastructure

**STATUS:** Experimental  
**Production `research.search`:** **sin cambios**  
**API keys / CAPTCHA bypass / metasearch / AGPL:** no  
**Fallback entre providers:** no  

---

## Objetivo demostrado

```text
HTML v1 → Scraper → Results ✓
HTML v2 → Drift STRUCTURAL_CHANGE → selector miss
       → Repair candidates → Validation PASS
Production recipe → intacta
```

Un cambio en una fuente es un **evento detectable y reparable**, no un fallo silencioso.

---

## Arquitectura

```text
node/src/research/scraping/
├── types.ts
├── scraper.ts          # contrato Scraper
├── runtime.ts          # análisis health/drift/repair
├── extraction/
│   ├── selector.ts     # Strategy A
│   ├── structural.ts   # Strategy B
│   ├── semantic.ts     # Strategy C
│   └── engine.ts
├── health/
│   ├── fingerprint.ts
│   ├── drift.ts
│   ├── quality.ts
│   └── monitor.ts
├── repair/
│   ├── generator.ts    # candidatos deterministas
│   └── validator.ts    # sandbox (no toca producción)
├── scrapers/duckduckgo.ts
└── fixtures/
```

Separación explícita:

| Capa | Responsabilidad |
| --- | --- |
| Scraper | fetch → extract → response |
| Extraction | selector / structural / semantic + confidence |
| Health | HEALTHY / DEGRADED / BROKEN / BLOCKED / UNKNOWN |
| Drift | NO_CHANGE … MAJOR_CHANGE (≠ bloqueo) |
| Repair | candidatos + validación; **sin deploy automático** |
| Search Engine | ranking / dedupe / selection (sin cambios) |

---

## Scraper de referencia

`duckduckgo-adaptive` — HTML DuckDuckGo con recipe de producción `ddg-result__a-v1`.

- Reutiliza `detectDuckDuckGoBlock` / `resolveDdgHref` existentes.
- Extracción vía engine adaptativo (no reescribe el provider PA `duckduckgo`).
- Fixtures: `ddg-v1.html`, `ddg-v2.html`, captcha, empty, partial, unexpected.

---

## Matriz de pruebas (14)

| Caso | Resultado |
| --- | --- |
| A HEALTHY v1 | pass |
| B minor change | pass |
| C structural v2 + recovery | pass |
| D unexpected | BROKEN/UNKNOWN |
| E CAPTCHA | BLOCKED |
| F 429 | BLOCKED |
| G 403 | BLOCKED (access, no parser) |
| H empty | BROKEN/UNKNOWN |
| I repair PASS | pass |
| J repair FAIL | pass |
| K producción intacta | pass |

---

## Benchmark (fixtures)

Script: `npm run research:benchmark:60.7 -w @mxideass/node`  
Artefacto: `research/phase-60.7-benchmark-raw.json`

Mide: extracción normal, drift, generación de candidatos, validación, parser original vs reparado.

---

## Lo que NO hace esta fase

- No cablea a `research.search` / Gateway / MCP
- No bypass anti-bot
- No fallback DDG→Mojeek
- No LLM repair agent
- No canary / auto-deploy a producción
- No nuevas deps npm / AGPL

---

## Evolución prevista (contratos listos)

```text
Health → Drift → Repair Agent → Validation → Canary → Human Approval → Production
```

Sin rehacer el runtime del scraper.

---

## DoD

- [x] Contrato Scraper + runtime independiente  
- [x] Extracción A/B/C + confidence  
- [x] Health + drift ≠ blocked  
- [x] Fixtures + contract tests  
- [x] Repair candidate + validation sandbox  
- [x] HTML v2 simulado detectado y recuperado  
- [x] Producción intacta  
- [x] Tests 14/14; typecheck  
- [x] Benchmark documentado  

## Recomendación

Mantener **experimental** hasta que un benchmark live (con fuentes reales no bloqueadas) demuestre robustez suficiente para un adapter opcional hacia el Search Engine.
