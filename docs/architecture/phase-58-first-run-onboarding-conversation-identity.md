# PHASE 58 — First Run, User Onboarding & Conversation Identity

**Status:** PARTIAL (automated PASS; manual install/uninstall E2E pending)  
**Fecha:** 2026-09-07

## 1. Estado anterior

- `ensureLocalIdentity()` creaba `local-user` con nombre `"Usuario local"` sin onboarding humano.
- La UI mostraba `session.deviceName` (p. ej. `"Navegador"` / textos técnicos) en lugar del nombre del usuario.
- Badge permanente `● Listo` en el sidebar.
- Conversaciones sin `summary`; la sidebar usaba `Conversación ${id.slice(0,8)}`.
- Uninstall Inno borraba `config`/`data`/`logs` pero **no** `credentials/`, `device-identity/`, `objects/`.

## 2. Causa

Separación incompleta entre identidad técnica (`local-user`) y perfil de presentación; metadata de conversación no persistida; cleanup de uninstall incompleto fuera del directorio de instalación.

## 3. Arquitectura de onboarding

```text
Session autenticada
  → ProfileNameScreen si profile_completed = 0
  → OnboardingWizard (LLM setup existente) si setup ≠ READY
  → UI normal
```

- Identidad técnica: `ensureLocalIdentity()` **sigue** garantizando `local-user`.
- Onboarding de producto: `users.profile_completed` + `users.name`.
- API: `GET/PATCH /v1/identity/me` (owner).
- Idempotente: reinicio no vuelve a pedir nombre si `profile_completed = 1`.

## 4. Relación User → PersonalAgent

Sin cambios de modelo: `local-user` → PersonalAgent. Solo se actualiza `users.name` (presentación).

## 5. Almacenamiento del nombre

- Tabla `users` (migración `009`).
- Flag `profile_completed` (migración `013_user_profile_completed.sql`).
- Nunca se muestra `local-user` ni `personal-agent` como label de cuenta.

## 6–7. Política de uninstall / secretos

Con confirmación YES, Inno elimina bajo `%LOCALAPPDATA%\Ideass\PersonalAgent\`:

```text
config/  data/  logs/
credentials/
device-identity/
objects/
runtime/
```

**No** se borran Documents / Desktop / Downloads ni el workspace del usuario.

Reinstall → nueva identidad criptográfica / nuevos secretos de instalación.

## 8–11. Conversation title / summary / generación / fallback

- Migración `012_user_profile_conversation_meta.sql`: `summary`, `updated_at` (sin DEFAULT no constante en ALTER).
- Generación **determinista** (sin LLM por render) en `gateway/src/memory/conversation-meta.ts`.
- Persistencia tras el primer turno útil desde el Gateway WS (`done`), **no** desde AgentRuntime (boundary SQLite).
- Fallback: `"Nueva conversación"` / texto humano del primer mensaje — nunca UUID/hash.
- Sidebar lee `title`/`summary` persistidos (`conversationListLabel`).

## 12. Tests

- `gateway/tests/identity/phase58-first-run-onboarding.test.ts`
- `web/tests/conversation-label.test.ts`
- `desktop/tests/uninstall-cleanup.test.cjs`

## 13. Riesgos restantes

- E2E manual de instalador Windows no ejecutado en CI.
- Títulos heurísticos (no LLM) — útiles pero menos “semánticos” que un modelo.
- Settings → estado del agente aún muestra “Listo/No listo” en diagnostics (no badge permanente del shell).

## 14. Manual E2E pendiente

```text
Fresh install → Onboarding nombre → UI con nombre → sin ● Listo
→ Conversación → title/summary
→ Restart → sin onboarding, metadata intacta
→ Uninstall → secrets gone → Reinstall → fresh device/install state
```
