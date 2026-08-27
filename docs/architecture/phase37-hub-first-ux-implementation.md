# PHASE 37 — Hub-first UX Implementation (P0)

**Estado:** PHASE 37 P0 IMPLEMENTED  
**Fecha:** 2026-08-26.

**Decision:** **PASS** → **READY FOR PHASE 38** (HITL product UX; no iniciar automáticamente).

## Objetivo

Hacer que Android sea **Hub-first** en el camino feliz: default Hub, first-run → Connection Hub, OpenClaw solo Avanzado/Legacy.

## Estado anterior

- Default backend GATEWAY  
- Boot → siempre Chat  
- Selector Hub debug-only  
- `RoutingChatConnection.active` inicial = gateway  

## Cambios realizados

1. `ConnectionPrefsPolicy.backendFromStored` → default **HUB** (creds legacy OpenClaw siguen resolviendo a GATEWAY).  
2. First-run: `firstRunDestination(!configured → Connection, configured → Chat)` en `AppNav`.  
3. Connection UI Hub-first + sección **Avanzado / Legacy** → OpenClaw.  
4. `RoutingChatConnection`: active inicial **hub**; `probe` siempre Hub; `chatConnectionForBackend`.  
5. Settings subtitle: agente en PC.  
6. Tests prefs / first-run / routing.

## Archivos

Ver informe de cierre (created/modified).

## Decisiones

- OpenClaw **no** eliminado.  
- HITL global **no** tocado (PHASE 38).  
- Sin cambios Runtime/MCP/DB/protocol.

## Riesgos

- Usuarios OpenClaw con prefs `gateway` siguen en OpenClaw (OK).  
- First-run Connection sin botón atrás: salida = system back.

## Deuda restante

- HITL solo ChatScreen (D-34-01 / PHASE 38)  
- Empty/loading History (P1)  
- Node unavailable UX (P1)  
- README agent placeholder (F)  

## Architecture changes

```text
NONE
```
