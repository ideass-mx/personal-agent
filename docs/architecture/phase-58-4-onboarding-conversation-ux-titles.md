# PHASE 58.4 — Onboarding identity + Conversation UX & semantic titles

**Status:** PARTIAL (automatizado; E2E Windows real pendiente)  
**Fecha:** 2026-09-07

## Problemas corregidos

1. **Onboarding:** PROFILE (nombre) → LLM (token) → Conversation.  
   `profileConfigured && llmConfigured` obligatorios. READY sin nombre no salta el perfil.
2. **Composer blank:** bloque «¿En qué te ayudo?» + composer en zona inferior-media vía flex chain (`work-area` → `conversation-screen` → `blank-stage`) con espaciadores `::before` / `::after` (más espacio arriba que abajo). No `bottom: 0` ni posicionamiento fixed/absolute del composer.
3. **Títulos:** tras el primer intercambio significativo, Gateway anota `title`/`summary`. Sidebar vía `GET /conversations`.

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
      → OnboardingWizard LLM
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
- Composer autofocus en blank  
- Blank-stage: flex spacers `::before` (flex mayor) + `::after` para lower-middle  
- Sin exponer AuthSession, Device, tokens, scopes en UI

## Validación pendiente

Status permanece **PARTIAL** hasta E2E Windows real (onboarding → primer mensaje → sidebar con título útil sin recargar).
