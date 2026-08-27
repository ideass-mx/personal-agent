# PHASE 38 — HITL Global Product UX

**Estado:** PHASE 38 CLOSED / IMPLEMENTED  
**Fecha:** 2026-08-26.

**Decision:** **PASS** → **READY FOR PHASE 39**

## Problema anterior

`confirm_request` solo mostraba diálogo si `ChatScreen` estaba composed → timeout 60s fail-closed sin UX (D-34-01).

## Solución

| Pieza | Rol |
|-------|-----|
| `ChatStore.pendingHubConfirm` | Estado global RAM (ya existía); una pending = la más reciente |
| `HubConfirmHost` + `HubConfirmViewModel` | UI global en `AppNav` (Box sobre NavHost) |
| `HubConfirmUx` | Countdown 60s + sanitize input |
| `AgentService` | Limpia pending si no `Conectado` |
| Gateway `ConfirmationWaiter` | Autoridad timeout / Session binding (**sin cambios**) |

## Multi-confirmación

Gateway `ConfirmationWaiter` usa `Map` por `confirmationId` (soporta varias). El Runtime suele serializar tools confirm. Android muestra **una** pending (sobrescribe). No se inventó cola.

## Navegación

Confirm visible en Chat / Sessions / Settings / Connection / Voice (cualquier destino bajo AppNav).

## Countdown

Aprox. 60s alineado a Gateway. Al llegar a 0: **limpia UI local**, no envía `approved=true`. Gateway sigue fail-closed.

## Dismiss

= Reject (`approved=false`).

## Disconnect / restart

Disconnect → clear pending local. Restart Android → no revive (no DataStore).

## Security / Protocol

Gateway autoridad. `confirm_request` / `confirm_response` sin frames nuevos. Sin PermissionManager.

## Architecture changes

```text
NONE
```

## Deuda restante

- Notificación FGS dedicada a confirm (opcional P1)
- Cola multi-confirm UI (no necesaria hoy)
- Empty/loading History (P1 PHASE 37)
