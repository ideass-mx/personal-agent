# PHASE 39 — First-run / Onboarding / Operational UX

**Estado:** PHASE 39 CLOSED / IMPLEMENTED  
**Fecha:** 2026-08-26.

**Decision:** **PASS** → **READY FOR PHASE 40**

## Problema

MVP técnico OK (37–38), pero el usuario nuevo enfrentaba fricción: copy Gateway/técnico, Chat vacío sin guía, History silenciosa, errores `agent_disconnected` crudos, FS root poco explicado, sin runbook.

## Decisiones

| Tema | Decisión |
|------|----------|
| `AGENT_FILESYSTEM_ROOT` obligatorio en código | **No** — requeriría fail-fast Node/Hub (cambio de contrato). **Sí** docs + UX + `.env.example` “recomendado”. |
| Node live status | **No** nueva API. Header: WS conectado → «Agente listo»; desconectado → «Sin conexión». Node mid-run solo vía error humanizado. |
| Gateway legacy | Sigue Avanzado/Legacy (37). |
| Architecture | **NONE** |

## Cambios

- `OperationalCopy` + header/banner/empty/history/error copy  
- `HistoryHydrationUi` + sync loading/error/retry  
- Connection tip FS root; Settings copy  
- `docs/runbook.md`; README Quick Start  
- Tests OperationalCopy + ChatThreads agent_disconnected  

## Deuda

- Liveness Node real (requiere señal/API)  
- Obligar FS root en boot (producto futuro con autorización)  
- Notif FGS confirm (38 P1)  

## Architecture changes

```text
NONE
```
