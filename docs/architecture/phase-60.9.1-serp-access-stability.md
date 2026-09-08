# PHASE 60.9.1 — SERP Access & Stability Investigation

**STATUS:** Experimental  
**Production `research.search`:** **sin cambios**  
**Depends on:** 60.7 · 60.8 · 60.9

---

## 1. Objetivo / pregunta

> ¿Existe actualmente un canal SERP zero-key, legítimo y suficientemente estable para discovery general, o debemos mantener SERP como capability experimental mientras JSON/API y direct-web operan?

Separar:

```text
ACCESS  vs  EXTRACTION  vs  STRUCTURAL DRIFT
```

---

## 2. Hipótesis

| ID | Hipótesis | Resultado (este entorno) |
| --- | --- | --- |
| H1 | Bloqueo DDG es route-specific | **No** — HTML y Lite bloqueados de forma equivalente |
| H2 | Canal estructurado DDG más adecuado | **d.js UNAVAILABLE** sin completar challenge/vqd (bypass fuera de alcance) |
| H3 | Lite ≠ HTML | Recipes distintas (sí); acceso live equivalente (bloqueado) |
| H4 | Mojeek API no es zero-key | **Confirmada** — no integrada |
| H5 | Runtime adaptativo útil aunque una fuente esté blocked | **Confirmada** — fixtures Lite/HTML recovery OK |

---

## 3. Endpoints investigados

| Endpoint | Adapter | Tipo |
| --- | --- | --- |
| `html.duckduckgo.com/html/` | `duckduckgo` | SERP_HTML |
| `lite.duckduckgo.com/lite/` | `duckduckgo-lite` (nuevo) | SERP_HTML |
| `links.duckduckgo.com/d.js` | `duckduckgo-djs` (probe) | SERP_JSON · **UNAVAILABLE** |
| `mojeek.com/search` | `mojeek` | SERP_HTML |
| Mojeek Search API | — | **NOT zero-key** |

**Third provider:** `NO THIRD PROVIDER` (criterios no cumplidos).

---

## 4. Metodología

- Misma query matrix que 60.9 (20 queries).
- HTML / Lite / Mojeek: **5 runs** × 20 (espaciado ~250 ms).
- d.js: probe de muestra (sin inventar vqd / sin bypass).
- Métricas: availability, blocked, empty, error, p50/p95 latency, quality cuando hay hits.
- Thresholds internos: excelente ≥95% · viable exp. ≥80% · inestable · no viable &lt;50%.

---

## 5. Resultados (corrida documentada)

Ver `research/phase-60.9.1-serp-access-summary.md` para números exactos de la corrida.

Hallazgo estructural:

```text
Fallo dominante = ACCESS (BLOCKED / challenge / captcha)
NO = STRUCTURAL_CHANGE del parser
```

Cuando hay fixtures:

```text
Lite recipe → HEALTHY
HTML v2 drift → recovery L1/L2
CAPTCHA → BLOCKED, recovery = NONE
```

---

## 6. ACCESS vs PARSER

| Scenario | Access | Parser | Recovery |
| --- | --- | --- | --- |
| Normal SERP | OK | PASS | — |
| DOM drift | OK | FAIL | PASS |
| Partial | OK | PARTIAL | PASS/FAIL |
| CAPTCHA / 403 / 429 | BLOCKED | N/A | NONE |
| timeout | ERROR | N/A | NONE |

---

## 7. Zero-key constraints

- Sin API keys / cuentas de pago.
- Sin CAPTCHA solving, proxies, fingerprint spoofing.
- Mojeek API explícitamente excluida.

---

## 8. Decisión

### C — SERP no operacional actualmente

```text
SERP architecture = VALID
SERP providers    = OPERATIONALLY UNRELIABLE
```

**No eliminar SERP.** Mantener `SERP_DISCOVERY` como capability preparada.

Operar discovery con:

```text
JSON/API + Direct Web + catálogos oficiales
```

hasta que exista un canal SERP zero-key estable (u otra fuente legítima).

---

## 9. Arquitectura (sin cambios de topología)

```text
QueryPlan → Source Discovery → SERP | JSON/API | Direct Web → SearchResult
```

Nuevos archivos:

```text
scraping/scrapers/duckduckgo-lite.ts
scraping/serp/adapters/duckduckgo-lite.ts
scraping/serp/adapters/duckduckgo-djs.ts
scraping/serp/access-notes.ts
```

---

## DoD

- [x] DDG HTML / Lite / d.js investigados  
- [x] Mojeek HTML medido; API documentada no zero-key  
- [x] No third provider  
- [x] 20×5 runs en canales HTML  
- [x] Availability / blocked / latency / quality  
- [x] ACCESS ≠ DRIFT; recovery sintético  
- [x] Tests + typecheck  
- [x] Raw + summary + este doc  
- [x] Decisión C  
- [x] `research.search` intacto  
