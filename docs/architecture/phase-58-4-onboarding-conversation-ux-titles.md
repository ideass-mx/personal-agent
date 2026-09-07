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
4. **Composer blank (rediseño):** `.blank-state` centrado (`align-items` / `justify-content: center`) con `.blank-state-content` (ancho `min(760px, calc(100% - 48px))`), heading + composer. Sin `.blank-stage` ni `::before`/`::after`, sin `margin-top` en vh. Composer multilínea (`textarea` + `.composer-shell`); Enter envía, Shift+Enter nueva línea (coarse/touch: Enter = nueva línea). Autosize 54–240px (crece/reduce vía `scrollHeight`). Mensajes `.msg p` a 16.5px / line-height 1.6. Header del hilo: solo título (sin `meta.summary`). No `bottom: 0` ni fixed/absolute/sticky en hero/dock.
5. **Scrollbar:** cadena `html/body/#root` + `work-area:has(> .conversation-screen)` + `.conversation-screen` → `overflow: hidden`; scroll solo en `.thread` (`overflow-y: auto`). Otras pantallas siguen con `overflow: auto` en work-area.
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

- Header shell: nombre + Plan Personal  
- Sin Home / «Tu agente» / Listo permanente  
- Blank: `.blank-state` / `.blank-state-content` (centrado; sin `blank-stage`, sin vh)  
- Composer: `textarea` + `.composer-shell`; autosize 54–240; Enter / Shift+Enter; autofocus vía `textareaRef`; `composer-hero` / `composer-dock` estáticos  
- Legibilidad: `.msg p` 16.5px / 1.6; composer-input 16px; cap-chip ~11px  
- Chat header: título de conversación; sin summary en UI del hilo  
- conversation-screen `height: 100%` + `flex: 1` + `min-height: 0` + `overflow: hidden`  
- Sin barra vertical doble: `html/body/#root` overflow hidden; work-area hidden solo con hijo `.conversation-screen`; scroll en `.thread`  
- Sin exponer AuthSession, Device, tokens, scopes en UI

## Validación pendiente

Status permanece **PARTIAL** hasta E2E Windows real (onboarding → primer mensaje → sidebar con título útil sin recargar).
