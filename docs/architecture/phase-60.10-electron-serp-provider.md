# PHASE 60.10 — Electron SERP Provider

**Estado:** completo (experimental)  
**Fecha:** 2026-09-08  
**Producción:** sin cambios (`research.search`, MCP, Gateway, AgentRuntime intactos)

## Objetivo

Convertir el runtime Electron de PHASE 60.9.6 en un `SerpAdapter` / provider reutilizable para **General Web Discovery**, sin cablearlo todavía a `research.search`.

## Arquitectura

```text
SerpDiscoveryProvider (opt-in adapters)
        ↓
electron-duckduckgo  (ElectronSerpProvider)
        ↓
ElectronSerpRuntime  (BrowserWindow show:false)
        ↓
DuckDuckGo SERP → DOM → normalize → dedupe → health
        ↓
SerpDiscoveryResult[]
```

Código:

| Pieza | Ruta |
| --- | --- |
| Provider / SerpAdapter | `node/src/research/experimental/electron-serp/provider.ts` |
| Search engine / health | `…/search-engine.ts` |
| Runtime 60.9.6 | `…/runtime.ts` + `electron-main.cjs` |
| Shim SERP | `node/src/research/scraping/serp/adapters/electron-duckduckgo.ts` |

**No** está en la lista default de `createSerpDiscoveryProvider()` (sigue DDG HTML + Mojeek HTTP). Uso:

```ts
createSerpDiscoveryProvider({
  adapters: [createElectronDuckDuckGoSerpAdapter({ mode: "reusable" })],
  sourceIds: ["electron-duckduckgo"],
})
```

## Restricciones respetadas

- Sin stealth / sin mutar `webdriver` / sin spoof / sin CAPTCHA bypass / sin proxies
- Perfil `userDataDir` temporal aislado
- `BrowserWindow` con `show: false`
- Sin Playwright Headless
- Recovery = interpretar HTML ya descargado (selector → structural → semantic); **BLOCKED no se repara**

## Benchmark (n=25 queries)

Artefactos:

- `research/phase-60.10-electron-serp-benchmark-raw.json`
- `research/phase-60.10-electron-serp-benchmark-summary.md`
- Script: `npm run research:benchmark:60.10 -w @mxideass/node`

| Metric | Valor |
| --- | ---: |
| Success rate | **100%** (25/25) |
| Blocked rate | **0%** |
| Avg / p50 / p95 latency (oneshot) | 4761 / 4421 / 6841 ms |
| Avg results | 9.96 |
| Avg top-3 relevance (0–3, heurística) | **2.24** |
| Official/gov/edu hits | 87 |
| Academic hits | 11 |
| Sesión reutilizable avg | **3228 ms** (1ª 4616; luego 2564–3316) |
| One-shot ×5 avg | **4969 ms** |

Cobertura: general, español, México, gobierno, universidades, tecnología, académico, news-ish, ambiguas — todas HEALTHY en esta corrida.


## Sesiones

- **oneshot:** `launch → search → close` por consulta  
- **reusable:** `warmUp → search×N → close` con **cola serial** (correctness > concurrency)

Cleanup: `close()` + SIGINT/SIGTERM en Electron main; sin procesos huérfanos observados tras el benchmark.

## Clasificación

**CASE A — viable**

Alta cobertura, bloqueo nulo en la muestra, latencia aceptable para investigación (~5 s oneshot; mejor con sesión), extracción estable, lifecycle limpio.

**Siguiente paso permitido por la evidencia:** diseñar integración experimental en `research.search` en una fase posterior — **aún no hecha**.

## Tests

- `node/tests/research/electron-serp-60.10.test.ts` — contrato, normalize, dedupe, CAPTCHA→BLOCKED, health, cola, cleanup, secrets  
- Live opcional: `ELECTRON_SERP_LIVE=1` (PostgreSQL 17 → `postgresql.org`)  
- Typecheck OK

## Idea de producto

El usuario no ve el navegador; solo:

```text
"Investiga esto."
```

Electron es infraestructura interna del agente — todavía experimental, no producción.
