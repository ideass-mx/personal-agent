# PHASE 58 — First Run, User Onboarding & Conversation Identity

**Status:** PARTIAL (código + tests automáticos; E2E Windows real pendiente)  
**Fecha:** 2026-09-07 (final fix: LLM uninstall + Home)

## 1. Estado anterior

- `ensureLocalIdentity()` creaba `local-user` con nombre `"Usuario local"` sin onboarding humano.
- La UI mostraba `session.deviceName` en lugar del nombre del usuario.
- Badge permanente `● Listo` en el sidebar.
- Conversaciones sin `summary`; la sidebar usaba IDs.
- Uninstall Inno borraba secretos solo si el usuario confirmaba YES (el token LLM podía sobrevivir).
- Tras onboarding, la entrada era `AgentSpaceScreen` (Home/dashboard antigua).

## 2. Causa

Separación incompleta identidad técnica vs perfil; metadata de conversación ausente; cleanup de uninstall **opcional** para `config/secrets.json` y `credentials/llm/`; navegación por defecto `nav=agent` → Home antigua.

## 3. Onboarding

```text
Session → ProfileNameScreen (profile_completed=0)
       → OnboardingWizard (LLM) si !llmConfigured
       → ConversationScreen (Personal Agent)
```

## 4–5. User / nombre

`users.name` + `users.profile_completed` (`013`). API `GET/PATCH /v1/identity/me`.

## 6–7. Uninstall / secretos LLM

**Inventario LLM:**

| Secret | Location |
|--------|----------|
| `anthropicApiKey` | `%LOCALAPPDATA%\Ideass\PersonalAgent\config\secrets.json` |
| Provider key | `...\credentials\llm\{provider}.api_key` |
| Legacy | `...\credentials\anthropic.api_key` |

**Siempre** (sin preguntar): borrar `secrets.json`, `credentials/llm`, `credentials/`, `config/`, `device-identity/`, `runtime/`.  
**Opcional YES:** `data/`, `logs/`, `objects/` (conversaciones). Workspace nunca.

`GET /v1/setup/status` ahora refleja clave real (`llmConfigured` / `onboardingCompleted` → false si no hay key).

Helper de prueba: `desktop/lib/uninstall-secret-cleanup.cjs`.

## 8–11. Conversation metadata

Sin cambios en este final fix (title/summary deterministas, persistidos).

## Home antigua

`AgentSpaceScreen` eliminada del producto web. Entrada = `ConversationScreen` (`nav=conversation`).

## Tests

- `desktop/tests/uninstall-cleanup.test.cjs` (Inno paths + purge funcional)
- `gateway/tests/identity/phase58-first-run-onboarding.test.ts`
- `web/tests/conversation-label.test.ts`

## Riesgos

- E2E Windows real no ejecutado en este entorno.
- Si el usuario conserva `data/` tras uninstall, el setup LLM se vuelve a pedir porque la clave ya no existe.
