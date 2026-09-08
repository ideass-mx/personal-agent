# PHASE 60.9.3 — DuckDuckGo Search-Space & Manual Browser

**Generated:** 2026-09-08T13:07:35.107Z  
**Browser (Playwright):** chrome  
**Production:** unchanged  
**Decision:** **D** (matiz: HTTP también SUCCESS en esta pasada; ver doc)

## Hallazgo central

El Browser Runner **sí** mete y envía la query (`queryEntered` + `querySubmitted` + navegación a `?q=`).  
El fallo de Playwright es **CHALLENGE post-submit**, no `BROWSER_RUNNER_FAILURE`.  
Manual (IDE Chromium) y HTTP obtuvieron SERP real. fill / insertText / type: sin diferencia funcional (los tres → CHALLENGE).

## Tabla principal

| Query | Manual | Playwright fill | Playwright insertText | Playwright type | HTTP |
| ----- | ------ | --------------- | --------------------- | --------------- | ---- |
| q1-general | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |
| q2-technical | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |
| q3-mexico | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |

## Tabla diagnóstico (Playwright)

| Query | Input entered | Submitted | Navigation | Challenge | Results |
| ----- | ------------: | --------: | ---------: | --------: | ------: |
| q1-general / fill | ✓ | ✓ | ✓ | ✓ | 5 |
| q1-general / insertText | ✓ | ✓ | ✓ | ✓ | 5 |
| q1-general / type | ✓ | ✓ | ✓ | ✓ | 5 |
| q2-technical / fill | ✓ | ✓ | ✓ | ✓ | 5 |
| q2-technical / insertText | ✓ | ✓ | ✓ | ✓ | 5 |
| q2-technical / type | ✓ | ✓ | ✓ | ✓ | 5 |
| q3-mexico / fill | ✓ | ✓ | ✓ | ✓ | 5 |
| q3-mexico / insertText | ✓ | ✓ | ✓ | ✓ | 5 |
| q3-mexico / type | ✓ | ✓ | ✓ | ✓ | 5 |

> Nota: los “5 results” crudos son enlaces del shell (App Store/Play/Duck.ai), no orgánicos. Tras filtrar challenge → 0 orgánicos.

## ¿El runner hace la misma operación que un usuario?

**YES — query entered and submitted; outcome after submit**

- queryEntered observado: true
- querySubmitted observado: true
- llega a SERP o challenge: true

Diverge del manual **después** del submit: Manual → SERP; Playwright → challenge/anomaly.

## Manual

- q1-general: SUCCESS results≈10 challenge=false (Cursor IDE Chromium (no Playwright). Homepage→fill input→Enter. Ads+organic visible. No challenge.)
- q2-technical: SUCCESS results≈10 challenge=false (Same IDE browser session. Organic postgresql.org release + downloads visible. No challenge.)
- q3-mexico: SUCCESS results≈10 challenge=false (Organic UANL/UP/UTM doctorados visibles. No challenge.)

## Search space (borrador)

Solo mecanismo básico en esta fase (3 queries). Categorías pendientes:

```text
SEARCH SPACE
├── General      ← q1 React TypeScript
├── Technical    ← q2 PostgreSQL 17
├── Mexico       ← q3 universidades doctorado IA
├── Academic     (pendiente)
├── Financial    (pendiente)
├── Local        (pendiente)
├── Long/Short   (pendiente)
└── Special chars (pendiente)
```

## Artefactos

- `research/phase-60.9.3-ddg-search-space/benchmark-raw.json`
- `docs/architecture/phase-60.9.3-ddg-search-space.md`
