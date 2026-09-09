# PHASE 61.2.2 — Local Model Installation Flow Diagnostics & UX

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-09  
**Relacionado:** `phase-61.2.0-restore-local-model-onboarding.md`,  
`phase-61.2.1-runtime-health-timeout.md`

## Pregunta

> ¿Qué hace Personal Agent tras pulsar «Instalar modelo», y dónde se va el tiempo?

## Actual flow (antes de esta fase)

```text
Web: await POST /v1/local-llm/install   ← Promise larga, poca visibilidad
        ↓
Gateway:
  1. Si falta binario → installLlamaServerRuntime()   ← SIN progreso a UI
  2. LocalModelManager.install()
       download GGUF (sí hay onProgress → inFlight)
       SHA-256 validate
  3. Transitions setup → READY
        ↓
Web poll /v1/local-llm/status
  solo veía downloading/validating DESPUÉS de (1)
```

**Variante real:** cercana a **B** (runtime → download → verify → done),  
**sin** arrancar `llama-server` ni health en el install.

```text
INSTALLATION ≠ FIRST RUNTIME START
```

El primer `ensureReady` / health ocurre en el **primer chat** (61.2.1).

### UI problem

Mientras (1) corría, `getInstallProgress()` era `null` → la UI quedaba en  
**«Preparando la instalación…»** con barra indeterminada, a veces minutos  
(descarga del zip del motor + extract), sin contexto.

## Changes

1. **Store** `install-progress.ts`: fases  
   `preparing | installing_runtime | downloading | verifying | complete | failed`  
   + bytes / % / bps / ETA / stageDurationsMs / timeline.
2. **POST install** actualiza fases; **GET status** expone `install: {…}`.
3. **Web** poll consume `install` y muestra títulos humanos por etapa + GB/% reales.
4. Sin inventar % si no hay `bytesTotal`.
5. Script `npm run research:diagnose:61.2.2` + JSON  
   `research/phase-61.2.2-local-model-installation.json`.

## Final flow (producto)

```text
Preparando tu agente
  ↓
Preparando el motor local   (solo si falta)
  ↓
Descargando tu modelo       (progreso real si hay total)
  ↓
Verificando el modelo
  ↓
Listo (setup) → onboarding continúa
```

**No** se muestra `llama-server` / SHA-256 / GGUF en UI.

## Known limitations

| Tema | Estado |
| --- | --- |
| Cancelación de descarga | No soportada (documentado) |
| Resume HTTP | No (partial se borra en error) |
| Startup/health en install | No — intentional; medir con 61.2.1 |
| ETA | Solo si velocidad estable (>~50 KB/s) |

## Bottleneck

Medir en Windows con:

```bash
PERSONAL_AGENT_LOCAL_LLM_LIVE=1 npm run research:diagnose:61.2.2
```

El resumen imprime duración por etapa. Hipótesis previa:

- Si «Preparando motor» es largo → descarga/extract de runtime.  
- Si «Descarga» es >80% → red / tamaño GGUF (~2.3 GiB).  
- Si el chat luego falla con `RUNTIME_HEALTH_TIMEOUT` → no es este install; es 61.2.1.

## Tests

- `gateway/tests/agent/local-llm-61.2.2.test.ts`
- `web/tests/install-progress-ui.test.ts`
