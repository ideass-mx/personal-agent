# PHASE 58.4 — Onboarding identity + Conversation UX & semantic titles

**Status:** PARTIAL (automatizado; E2E Windows real pendiente)  
**Fecha:** 2026-09-07

## Problemas corregidos

1. **Onboarding:** PROFILE (nombre) → LLM (token) → Conversation.  
   `profileConfigured && llmConfigured` obligatorios. READY sin nombre no salta el perfil.
2. **Composer blank:** bloque «¿En qué te ayudo?» + composer en zona inferior-media vía flex + padding asimétrico (`blank-stage`), no `bottom: 0`.
3. **Títulos:** tras el primer intercambio significativo, Gateway anota `title`/`summary` con el LLM existente (Anthropic/`LLMProvider`); fallback determinista si falla. Sidebar vía `GET /conversations`.

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
        → LLM JSON {title, summary}  |  derive* fallback
        → UPDATE conversations
    → web refreshConversations (+ delayed 1.8s / 4.5s)
```

- Lista: `GET /conversations?limit=` (incluye casuales sin workspace).
- No regenera si ya hay título semántico y summary.
- Fallo de anotación no rompe el turno.

## UX invariantes

- Header: nombre + Plan Personal  
- Sin Home / «Tu agente» / Listo permanente  
- Composer autofocus en blank  
- Sin exponer AuthSession, Device, tokens, scopes en UI
