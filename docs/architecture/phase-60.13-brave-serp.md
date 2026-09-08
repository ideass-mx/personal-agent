# PHASE 60.13 — Brave Web SERP Provider

**Estado:** completo (experimental)  
**Fecha:** 2026-09-08  
**Decisión:** **CASE B — PARCIAL**  
**Producción:** UNCHANGED (`electron-duckduckgo`)

## Objetivo

Evaluar **Brave Search Web** (`https://search.brave.com/`) como segundo camino de General Web Discovery usando el **mismo** `ElectronSerpRuntime` de PHASE 60.12.

Sin Brave Search API, sin API key, sin cuenta, sin stealth, sin CAPTCHA solving, sin fallback automático.

## Arquitectura

```text
SerpDiscoveryProvider (opt-in adapters)
        ↓
createElectronBraveSerpAdapter  (electron-brave)
        ↓
ElectronSerpRuntime   ← compartido con DDG
        ↓
BrowserWindow(show:false)
        ↓
https://search.brave.com/search?q=…
        ↓
DOM → extraction (brave-result-v1) → SerpDiscoveryResult[]
```

DuckDuckGo permanece el provider productivo de `research.search`.

## Cómo se ejecutó

```bash
cd node && npm run research:benchmark:60.13
```

1. Smoke: 3 queries × 3 runs, sesión warm Brave.  
2. Si smoke pasa → full 25 queries Brave + 25 DDG (mismo dataset estilo 60.10).  
3. Artefactos en `research/phase-60.13-brave-serp-benchmark-*.{json,md}`.

## Condiciones del experimento

| Regla | Cumplida |
| --- | --- |
| Electron background `show:false` | sí |
| Sin Playwright Headless | sí |
| Sin fingerprint spoofing | sí |
| Sin Brave API / tokens | sí |
| Sin fallback DDG→Brave | sí |
| Default productivo sin cambio | sí |

## Resultados

### Smoke

- **7/9 success** (~78%), **2/9 blocked** (final del run 3)
- Avg results 10, latency warm ~280–800 ms cuando OK

### Full (tras smoke)

| | DDG | Brave |
| --- | --- | --- |
| Success | 100% | 0% |
| Blocked | 0% | 100% |
| Top-3 | 2.15 | — |

Brave elevó challenge/protección tras el volumen del smoke. DDG en el mismo runtime no se vio afectado.

## Bloqueos

- No bloqueo total desde la primera query.
- Soft-block / challenge tras ~7–8 búsquedas automatizadas seguidas.
- Clasificado como **BLOCKED** en métricas (no DRIFT); sin recovery de CAPTCHA.

## Latencia (cuando OK)

- Smoke warm: a menudo **&lt; 1 s** (mejor que DDG cold; comparable a DDG warm).
- Full Brave: N/A (bloqueado).

## Calidad (cuando OK)

- Smoke: 10 resultados/avg, orgánicos útiles (p.ej. postgresql.org).
- Full: no evaluable por bloqueo.

## Diferencias vs DuckDuckGo

| | DDG Electron | Brave Electron |
| --- | --- | --- |
| Estabilidad bajo carga | alta (100% full) | baja (challenge tras volumen) |
| Acceso inicial | sí | sí |
| API key | no | no |
| Default productivo | sí | no (experimental) |

## Decisión

**CASE B — PARCIAL**

Brave Web **puede** devolver SERP útiles vía Electron sin API, pero **no** es estable como segundo camino bajo uso de investigación repetida. Requiere más investigación (p.ej. pacing, límites de sesión) antes de considerarlo candidato productivo.

**No** se integra fallback automático. Siguiente candidato previsto: **Mojeek** bajo las mismas condiciones.

## Implementación

| Pieza | Ruta |
| --- | --- |
| Adapter | `node/src/research/experimental/electron-serp/brave-provider.ts` |
| Helpers | `brave.ts`, `brave-search-engine.ts` |
| Recipe | `brave-result-v1` en `scraping/scrapers/brave.ts` |
| Runtime cmd | `searchBrave` en `electron-main.cjs` |
| Fixtures | `brave-v1.html`, `brave-empty.html`, `brave-captcha.html` |
| Tests | `node/tests/research/electron-serp-60.13.test.ts` |

## Relacionado

- PHASE 60.12 — Electron primary + warm runtime (base)
- PHASE 60.10 / 60.11 — Electron DDG provider / integración
