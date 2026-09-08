# PHASE 60.8 — Benchmark Summary

**Generated:** 2026-09-08T06:25:43.592Z  
**Production `research.search`:** intacto  
**Fallback entre providers:** no  

## Pregunta de la fase

> ¿La infraestructura adaptativa es suficientemente robusta frente a la Web real para justificar providers opcionales?

## Synthetic (60.7) vs Live

| Check | Synthetic | Live |
| --- | --- | --- |
| Drift detection | STRUCTURAL_CHANGE on HTML v2 | fingerprints únicos DDG: 2/2 |
| Semantic/structural recovery | strategy=semantic, hits=3 | ver recovery rate |
| Block classification | CAPTCHA→BLOCKED (tests) | blockedRate DDG=0.818, Mojeek=1 |
| Repair candidates útiles | recoveryLevel=1, recovered=true | parserFailures=1, recovered=1 |

## Recovery Rate

```text
anomalies:        10
parserFailures:   1
blocked:          9
recovered:        1
Recovery Rate:    1
```

Blocked **no** cuenta como fallo reparable.

## Comparación scrapers (live)

| Provider | Coverage | Quality | Blocked | Latency | Confidence | Avg results |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DDG adaptive | 18% | 0.813 | 82% | 249ms | 0.929 | 8 |
| Mojeek adaptive | 0% | 0 | 100% | 229ms | 0 | 0 |
| Wikipedia JSON | 27% | 0.667 | 0% | 160ms | 0.873 | 5.7 |

## Direct sites

- sat: health=DEGRADED hits=1 75ms
- unam: health=BLOCKED hits=0 111ms
- react: health=HEALTHY hits=5 449ms
- mdn: health=HEALTHY hits=5 248ms

## Veredicto

**Parcial / débil para SERP HTML.** DDG (~82% blocked) y Mojeek (100% blocked) no son estables como providers de producto en este entorno. Cuando DDG responde, la calidad de extracción es alta (confidence ~0.93). Wikipedia JSON y direct-page (react.dev, MDN, SAT parcial) sí aportan señal.

La infraestructura adaptativa (health / drift / recovery) **sí funciona** (sintético: recoveryLevel 1, rate 1.0 sobre parser failures). **No** justificar cablear SERP scrapers a `research.search` todavía. Sí conviene seguir con JSON_ENDPOINT + direct-page + fuentes oficiales.


## Artefacto

Raw: `research/phase-60.8-benchmark-raw.json`
