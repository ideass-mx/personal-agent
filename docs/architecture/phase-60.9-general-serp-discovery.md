# PHASE 60.9 — General SERP Discovery Engine

**STATUS:** Experimental  
**Production `research.search`:** **sin cambios**  
**Capability:** `SERP_DISCOVERY`  
**Depende de:** Adaptive Scraping Runtime (60.7/60.8)

---

## 1. Objetivo

Validar la hipótesis:

> SERP puede ser mecanismo genérico de descubrimiento web para Personal Agent si la extracción está desacoplada del proveedor y protegida por un runtime adaptativo.

---

## 2. Arquitectura

```text
SerpDiscoveryProvider  (SERP_DISCOVERY)
        ↓
Source Registry
        ↓
SerpAdapter (DDG | Mojeek)
        ↓
Adaptive Scraping Runtime
        ↓
selector → structural → semantic
        ↓
Health / Drift / Recovery
        ↓
SerpDiscoveryResult[]   source: "serp"
```

El Search Engine futuro conoce **`SERP_DISCOVERY`**, no HTML de un motor concreto.

Ubicación: `node/src/research/scraping/serp/`

---

## 3. SERP abstraction

| Pieza | Rol |
| --- | --- |
| `SerpSource` | Registry: endpoint, capabilities, recipe, enabled |
| `SerpAdapter` | buildRequest, detectBlock, getInitialRecipe, search |
| `SerpDiscoveryProvider` | fan-out explícito + normalización + reports |
| `SerpDiscoveryResult` | title, url, snippet, domain, position, source=`serp`, providerId |

Sin fallback silencioso: cada provider reporta `health` / `blocked` / `recoveryLevel`.

---

## 4. Providers

| Provider | Kind | Implemented | Notes |
| --- | --- | --- | --- |
| DuckDuckGo HTML | SERP_HTML | Sí | Adapter + recipe `ddg-result__a-v1` |
| Mojeek HTML | SERP_HTML | Sí | Recipe propia `mojeek-ob-v1` |
| Third | — | **No** | Ver §4.1 |

### 4.1 Tercer proveedor

```text
Only two legitimate SERP sources
were suitable for this experiment.
```


---

## 5. Extraction pipeline

```text
Initial selector
  → quality
  → structural (L1)
  → semantic (L2)
  → recovered | L3 unsupported
```

BLOCKED (CAPTCHA/403/429/challenge) **no** dispara repair.

---

## 6. Drift experiment (synthetic)

| HTML | Resultado |
| --- | --- |
| v1 | selector HEALTHY, L0 |
| v2 | STRUCTURAL_CHANGE → recovery L1/L2 |
| v3 | DOM mayor → structural/semantic recovery |
| captcha | BLOCKED, sin repair |

**syntheticRecoveryRate:** 1.0 (en corrida documentada)

---

## 7. Live benchmark

Artefactos:

- `research/phase-60.9-serp-benchmark-raw.json`
- `research/phase-60.9-serp-benchmark-summary.md`

Query matrix: general / México / technical / academic / financial / local (20 queries).

En la corrida de cierre de esta fase:

| Provider | Coverage | Blocked |
| --- | ---: | ---: |
| DuckDuckGo | 0% | 100% |
| Mojeek | 0% | 100% |

(El bloqueo operativo varía por entorno; en 60.8 DDG llegó ~18% coverage. El parser no es el cuello de botella.)

**liveRecoveryRate:** n/a cuando no hay structural failures live (todo BLOCKED).

---

## 8. Findings

1. Abstracción común SERP → `SearchResult`-like funciona.
2. Runtime adaptativo es **reutilizable** entre motores.
3. **BLOCKED ≠ STRUCTURAL_CHANGE** — verificado en tests.
4. Recovery sintético **alto**; live limitado por anti-bot, no por extracción.
6. El problema dominante es **acceso**, no **scraping**.

---

## 9. Decisión final

### B — `SERP viable como discovery experimental`

La arquitectura es la pieza correcta para discovery genérico.  
SERP debe permanecer como **capa fundamental experimental**, complementada por JSON/API y direct web — **no** cablear a producción hasta que exista al menos un SERP HTML con blocked-rate aceptable de forma sostenida, o un SERP legítimo adicional zero-key.

---

## 10. Limitations

- Solo 2 fuentes SERP HTML legítimas en alcance.
- Live altamente bloqueado en muchos entornos.
- Sin auto-deploy de recipes.
- Sin LLM repair.
- Sin crawler/índice global.

---

## 11. Recommendation

```text
Next (selectivo):
  SERP_DISCOVERY  → experimental optional provider
  + JSON_ENDPOINT / official catalogs
  + direct-page fetch
  ≠ replace research.search default yet
```

---

## DoD

- [x] SERP abstraction + registry  
- [x] DDG + Mojeek  
- [x] Third documentado como no disponible  
- [x] Extraction A/B/C + drift + block  
- [x] BLOCKED ≠ STRUCTURAL_CHANGE  
- [x] Recovery metrics + live/synthetic benchmarks  
- [x] Tests 14 (60.9) + previos  
- [x] TypeScript  
- [x] Docs + conclusión B  
- [x] `research.search` intacto  
