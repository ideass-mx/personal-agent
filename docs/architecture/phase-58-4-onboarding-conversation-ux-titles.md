# PHASE 58.4 — Onboarding identity + Conversation UX & semantic titles

**Status:** PARTIAL (automatizado; E2E Windows real pendiente)  
**Fecha:** 2026-09-07

## Problemas corregidos

1. **Onboarding:** PROFILE (nombre) → LLM (token) → Conversation.  
   `profileConfigured && llmConfigured` obligatorios. READY sin nombre no salta el perfil.  
   `AGENT_READY` / `installationReady` → paso wizard `llm_intro` (nunca «Agente listo» prematuro).
2. **Identidad:** `AGENT_NAME` / `DEFAULT_AGENT_NAME` / `SYSTEM_PROMPT` = **Personal Agent** (no Claude como identidad primaria). Modelo por defecto: `claude-sonnet-4-6` (infra LLM; no se cambia salvo rotura).
3. **Diagnóstico LLM:** `verifyProviderConnectivity` pasa `model: DEFAULT_AGENT_MODEL` y expone en `POST /v1/setup/verify`  
   `connectivity: { provider, model, credentialConfigured, request }` (sin apiKey ni sample).  
   Log: `[gateway] llm_connectivity provider=… model=… credentialConfigured=true request=success`.
4. **Composer blank:** bloque «¿En qué te ayudo?» + composer en zona inferior-media vía flex chain (`work-area` → `conversation-screen` → `blank-stage`) con espaciadores `::before` (~1.8) / `::after` (~1.2), `min-height: 0`. No `bottom: 0` ni posicionamiento fixed/absolute del composer.
5. **Scrollbar:** causa = `.work-area { overflow: auto }` + scroll en `.thread`. Fix: `.work-area:has(> .conversation-screen) { overflow: hidden }` (otras pantallas siguen con `overflow: auto`).
6. **Títulos:** tras el primer intercambio significativo, Gateway anota `title`/`summary`. Sidebar vía `GET /conversations`.

## Causa raíz del bug de títulos

1. **LLM-first write:** `maybeAnnotateConversationAsync` esperaba al proveedor antes de persistir. Con clave placeholder, timeout o red lenta, `title` seguía null/`Nueva conversación` durante varios segundos.
2. **Ventana de poll corta en web:** tras `assistant_done` solo había 1–2 refrescos fijos (~1.8s / 4.5s). Si el seed/LLM llegaba después, el sidebar no actualizaba.

## Fix

1. **Seed determinista antes del await LLM:** `maybeAnnotateConversation` escribe `title`/`summary` de inmediato; luego un upgrade LLM acotado (`LLM_META_TIMEOUT_MS`, ~3.5s). Si el LLM falla, el fallback ya está persistido.
2. **Poll hasta titulado:** `refreshConversationsUntilTitled` en `AppContext` tras `assistant_done` (delays 0 → 7s) hasta que el título no sea placeholder.
3. **Import estático** de `maybeAnnotateConversationAsync` en el WS handler (sin dynamic import que retrase el fire-and-forget).

## Flujo onboarding

```text
Launch → ProfileName (¿Cómo quieres que te llame?)
      → OnboardingWizard LLM (llm_intro; sin «Agente listo» prematuro)
      → ConversationScreen
```

Gate web: `resolveProductSurfaceGate({ profileConfigured, llmConfigured })`.

## Metadatos de conversación

```text
assistant_done
    → maybeAnnotateConversationAsync (fire-and-forget)
        → seed sync: derive* → UPDATE conversations   ← visible de inmediato
        → LLM JSON {title, summary} (timeout acotado)  ← upgrade opcional
        → si LLM falla: se conserva el seed
    → web refreshConversationsUntilTitled(conversationId)
        → poll GET /conversations hasta título semántico o agotar delays
```

- Lista: `GET /conversations?limit=` (incluye casuales sin workspace).
- No regenera si ya hay título semántico y summary.
- Fallo de anotación no rompe el turno.
- Logs diagnósticos: `annotation_started` / `title_generated` / `summary_generated` / `annotation_completed` / `annotation_failed` (sin prompts ni claves).

## UX invariantes

- Header: nombre + Plan Personal  
- Sin Home / «Tu agente» / Listo permanente  
- Composer autofocus en blank; `composer-hero` con `position: static`  
- Blank-stage: flex spacers `::before` (≈1.8) + `::after` (≈1.2); conversation-screen `height: 100%` + `flex: 1` + `min-height: 0`  
- Sin barra vertical doble: work-area hidden solo con hijo `.conversation-screen`  
- Sin exponer AuthSession, Device, tokens, scopes en UI

## Validación pendiente

Status permanece **PARTIAL** hasta E2E Windows real (onboarding → primer mensaje → sidebar con título útil sin recargar).
