# PHASE 60.9 — SERP Discovery Benchmark Summary

**Generated:** 2026-09-08T06:38:53.655Z  
**Capability:** `SERP_DISCOVERY`  
**Production `research.search`:** intacto  

## Pregunta


## Drift experiment (synthetic)

| HTML | Hits | Strategy | Recovery | Drift/Block |
| --- | ---: | --- | --- | --- |
| v1 | 3 | selector | L0 | HEALTHY |
| v2 | 3 | semantic | L1 recovered=true | STRUCTURAL_CHANGE |
| v3 | 3 | semantic | L1 recovered=true | major DOM |
| captcha | 0 | — | n/a | BLOCKED (no repair) |

**syntheticRecoveryRate:** 1 (2/2)

## Live providers

| Provider | Coverage | Blocked | Extraction | Recovery | Quality | Latency avg/p50/p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DuckDuckGo | 0% | 100% | 0 | n/a | t=0 u=0 s=0 | 120/126/137 ms |
| Mojeek | 0% | 100% | 0 | n/a | t=0 u=0 s=0 | 228/185/266 ms |

**liveRecoveryRate** (structural only): n/a (0/0)

### DuckDuckGo counts

```text
queries=20 successful=0 empty=0
blocked=20 degraded=0
structuralChanges=0 recovered=0 failed=0
```

### Mojeek counts

```text
queries=20 successful=0 empty=0
blocked=20 degraded=0
structuralChanges=0 recovered=0 failed=0
```

## Findings

1. **Abstracción SERP_DISCOVERY** funciona: resultados `source: "serp"` + `providerId` en diagnóstico.
2. **BLOCKED ≠ STRUCTURAL_CHANGE** verificado (CAPTCHA/403/429 vs HTML v2/v3).
3. **Recovery sintético** fuerte (selector→structural/semantic).
4. **Bloqueo operativo** es el límite principal en live (no el parser).
5. **Sin tercer SERP** legítimo zero-key / non-metasearch para el experimento.

## Decisión

### B — `SERP viable como discovery experimental`

La arquitectura SERP_DISCOVERY + adaptive scraping funciona (recovery sintético alto). Bloqueo operativo limita producción; SERP permanece pieza fundamental experimental complementada por JSON/API y direct web.

## Artefactos

- `research/phase-60.9-serp-benchmark-raw.json`
- `docs/architecture/phase-60.9-general-serp-discovery.md`
