# PHASE 61.2.0 — Restore Local Model Onboarding Gate

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-09  
**Relacionado:** `phase-61-local-llm.md`, `phase-61.1-local-inference.md`,  
`phase-61.2.1-runtime-health-timeout.md`

## Pregunta

> ¿Personal Agent puede declararse listo para conversar sin Qwen3 4B instalado?

**No.** Con `provider=local` (default), el producto exige modelo local
validado (`llmConfigured` / `isLocalLlmConfigured`) antes del chat.

## Qué se había perdido

El flujo de recomendación/instalación **seguía existiendo**
(`hardware` → `local_recommend` → `local_installing`), pero:

1. El botón **«Continuar sin modelo»** saltaba a `optional_android` → `done`
   sin instalar ni transicionar setup.
2. `App.tsx` marcaba `setupDone=true` en `onCompleted` **sin revalidar**
   `llmConfigured`.
3. `POST /v1/setup/transition` a `READY` no exigía LLM real y devolvía
   `llmConfigured` vía `hasProviderApiKeyConfigured(…|| "anthropic")`,
   incorrecto para local.

Gateway podía estar `AGENT_READY` / running; eso **no** es producto listo.

## Dónde estaba

| Pieza | Ubicación |
| --- | --- |
| Wizard | `web/src/features/setup/OnboardingWizard.tsx` |
| Gates | `web/src/features/setup/setup-flow.ts` |
| App surface | `web/src/App.tsx` |
| Setup HTTP | `gateway/src/http/setup-http.ts` |
| Modelo | `gateway/src/local-llm/manager.ts` + `local-model-http.ts` |

## Qué se restauró

1. Eliminado **«Continuar sin modelo»**.
2. Gate al entrar al chat: `ensureLlmOrBlockInstall` + `App` re-fetch de
   `/v1/setup/status`.
3. `READY` / `VERIFIED` rechazados sin LLM (`llm_required`).
4. Respuesta de transition = `setupStatusPayload()` (llmConfigured real).
5. Al cargar sin LLM → `enterLocalModelGate()` (recomendación Qwen3 4B;
   si ya instalado, no re-descarga).
6. Copy de instalación + barra de progreso (ya en 61.x).
7. Settings → Inteligencia sigue mostrando estado; aviso si no listo.

## AGENT_READY (producto)

```text
Gateway running          ✓  (SYSTEM_RUNNING)
AgentRuntime             ✓
Qwen3 4B instalado       ✓  ← obligatorio si provider=local
llama-server (verify)    ✓  best-effort en onboarding
llmConfigured            ✓
────────────────────────────
Chat / superficie ready  ✓
```

Sin modelo:

```text
llmConfigured = false
→ surface = "llm" (OnboardingWizard)
→ chat bloqueado
```

## Instalación Qwen3 4B

```text
Instalar modelo
  → POST /v1/local-llm/install
  → download + SHA-256 (catálogo PHASE 61)
  → runtime install best-effort
  → setup LLM_CONNECTED → READY (si modelo OK)
```

## Modelo ya instalado

`enterLocalModelGate` consulta `/v1/local-llm/status`; si `ready`,
avanza sin descarga.

## Modelo corrupto / descarga fallida

Mensajes de verificación / reintento en el wizard; no se abre el chat.

## Sin fallback cloud

«Configuración avanzada» sigue permitiendo Anthropic **explícito**;
nunca se activa por omitir el modelo local.

## Relación con 61.2.1

Esta fase **no** corrige `RUNTIME_HEALTH_TIMEOUT`.  
Si el runtime falla el health tras instalar el modelo, el modelo puede
estar en disco (`llmConfigured` vía archivo activo) y el diagnóstico
sigue en `phase-61.2.1-runtime-health-timeout.md`.

## Tests

- `web/tests/setup-onboarding.test.ts` — gate + sin «Continuar sin modelo»
- `gateway/tests/setup/setup-state.test.ts` — READY sin LLM → error

## Definition of Done

- [x] Pantalla de instalación vuelve (sin bypass)
- [x] Qwen3 4B recomendado
- [x] Progreso de descarga
- [x] READY / chat exigen LLM
- [x] Gateway arranca sin modelo
- [x] Sin fallback silencioso
- [x] Docs + tests
- [ ] Validación manual Windows (host del usuario)
