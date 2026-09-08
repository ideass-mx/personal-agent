# PHASE 60.6.4 — General Web Provider Layer

**STATUS:** Experimental  
**Production:** `research.search` **UNCHANGED**  
**API keys / CAPTCHA bypass / metasearch / AGPL:** no  
**Fallback disfrazado (OpenAlex safety net):** **ELIMINADO**

---

## Pregunta de la fase


**Respuesta con evidencia:** **parcial**.

| Área | ¿Cubierta? |
| --- | --- |
| Academic | Sí (OpenAlex / Crossref / arXiv) |
| Knowledge | Parcial (Wikipedia / DDG Instant Answer; IA a menudo vacía en ES) |
| Technical / community | Parcial (Hacker News Algolia) |
| ES/MX official / gov / uni | **Mejora clara** vía catálogo `mx-official` |
| General web abierto (laptops, “qué es X”) | **No** — sin fuente SERP legítima zero-key |
| News global | Parcial (HN; no Google News por ToS) |

---

## A. Providers evaluados

| Provider | Type | Access | Auth | License/ToS | Stability | Coverage | Implemented? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DuckDuckGo HTML | general web | HTML POST | No | ToS / anti-bot | CAPTCHA | amplio | **Disabled default** | UNSUITABLE como primario |
| Mojeek HTML | general web | HTML GET | No | CAPTCHA | CAPTCHA | amplio | **Disabled default** | UNSUITABLE |
| DuckDuckGo Instant Answer | knowledge | JSON API | No | público documentado | estable | limitado | **Sí** | Legítimo; no es SERP completo |
| Hacker News Algolia | technical/news | JSON API | No | API pública | estable | HN only | **Sí** | Aporta technical/news |
| mx-official | gov/uni MX | catálogo local | No | propio | estable | directorio | **Sí** | Mejora ES/MX official |
| Wikipedia | knowledge | MediaWiki | No | OK | estable* | knowledge | Sí (previo) | *empty frecuente en corrida |
| OpenAlex / Crossref / arXiv | academic | REST/Atom | No | OK | estable | academic | Sí | Solo academic/research |
| Google News RSS | news | RSS | No | **ToS automatización** | OK técnico | news | **No** | ToS concern → DO NOT |
| datos.gob.mx CKAN | government data | API | No | 403/WAF aquí | bloqueado | datos | **No** | Access Denied |
| Brave/Bing/Google CSE | general | API | **Key** | comercial | — | amplio | **No** | API key obligatoria |

---

## B. Providers implementados

### `duckduckgo-ia`
- **Endpoint:** `GET https://api.duckduckgo.com/?q=&format=json&no_html=1`
- **Capabilities:** knowledge, general (limitado); stable; no safeSearch
- **Errors:** http_error / rate_limited / parse_error / empty
- **Límites:** no es buscador web completo; muchas queries ES → empty

### `hackernews`
- **Endpoint:** `GET https://hn.algolia.com/api/v1/search`
- **Capabilities:** technical, news; freshness via `created_at`
- **Normalización:** title, url|story_url, snippet HN metadata

### `mx-official`
- **Método:** match determinista de keywords → URLs oficiales (SAT, DOF, Banxico, INEGI, SECIHTI, gob.mx, UAQ, UNAM, IPN, CINVESTAV)
- **Capabilities:** government, knowledge; region MX
- **No** es crawl ni índice web; directorio curado explicable

### HTML DDG / Mojeek
- Código permanece para experimentos (`enabled: false` por defecto)

### Selección
- **Sin** OpenAlex safety net
- OpenAlex/Crossref/Arxiv solo si `facetsForPlan` incluye `academic` (intent `academic` | `research`)

---

## C. Benchmark (live)

Artefacto: `research/phase-60.6.4-benchmark-raw.json`

| Métrica | 60.6.3 (con safety net) | **60.6.4** |
| --- | ---: | ---: |
| Empty rate | 0/15 | **3/12** (honesto en general puro) |
| Avg official/gov/uni | 0.13 | **1.17** |
| Avg academic | alto | ~2.6 (solo cuando el plan lo pide) |
| Avg latency | ~614 ms | ~562 ms |

Ejemplos:

- `SAT declaración anual` → `sat.gob.mx` (government)
- `inflación México 2026` → Banxico + INEGI
- `doctorado … UAQ` → uaq.mx + academic
- `mejores laptops…` / `What is quantum computing?` → **empty** (sin SERP)


---

## D. Decisiones

| Qué | Decisión |
| --- | --- |
| Safety net OpenAlex | **Eliminado** — falseaba cobertura |
| HTML scrapers | No como solución principal |
| Google News RSS | Descartado (ToS) |
| datos.gob.mx | Descartado (403) |
| DDG Instant Answer + HN + mx-official | **Aceptados** (legítimos, zero-key) |
| Índice/crawler propio | **No** en esta fase |

---

## E. Gaps restantes

```text
general web abierto     → falta SERP legítimo zero-key
news global estable     → HN parcial; Google News no
government deep search  → catálogo ayuda; no busca dentro de sat.gob.mx
Wikipedia reliability   → empty observado en corrida
financial live prices   → solo portales oficiales, no cotizaciones
```

### Conclusión estratégica

```text
Personal Agent Search Engine
  ├── Academic + Knowledge + MX Official  → usable
  └── General Web abierto                 → GAP
        ↓
Future (si se confirma):
  Personal Agent Web Index / allowlist crawl
  (NO antes de agotar fuentes legítimas — ya documentado)
```

Todavía **no** hay evidencia suficiente para cablear producción.

---

## DoD checklist

- [x] Sin metasearch / AGPL / API keys / CAPTCHA bypass  
- [x] Sin fallback; safety net eliminado  
- [x] OpenAlex solo academic/research  
- [x] Fuentes legítimas identificadas e implementadas (1–3)  
- [x] ES/MX official mejora (benchmark)  
- [x] Ranking determinista / dedupe / agreement intactos  
- [x] Tests 66 pass  
- [x] Benchmark documentado  
- [x] Gaps claros  
- [x] Sin crawler global  
- [x] `research.search` producción intacto  

## Recomendación

**PHASE 60.6.5 (opcional):** ampliar catálogo MX + Wikidata; o spike controlado de **allowlist index** solo para dominios `.gob.mx`/`.edu.mx` con politeness — no SERP comercial con keys.
