# PHASE 57.5 — Tool Safety Policy

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-06  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md)  
**Sesión:** [`session-identity.md`](./session-identity.md)

## Qué es

**Tool Safety Policy** decide si una tool del PersonalAgent puede:

| Decisión | Código legacy (`executionMode`) | Efecto |
|----------|----------------------------------|--------|
| `ALLOWED` | `automatic` | Ejecuta |
| `CONFIRMATION_REQUIRED` | `confirm` | HITL existente → execute / cancel |
| `DENIED` | ausente en policy | No ejecuta |

No es autenticación. No es ownership. No es RBAC.

```text
Authentication → AuthSession → UserContext
Ownership     → assertAgentOwner
Tool safety   → evaluateToolSafety(UserContext?, tool, policy)
```

## Frontera de ejecución

```text
AgentRuntime
  → tool_call
  → evaluateToolSafety (PersonalAgent.toolPolicy)
  → ALLOWED | CONFIRMATION_REQUIRED | DENIED
  → HITL (solo confirm) | execute | reject
  → MCP / Node (sin cambio de protocolo)
```

Punto único: `gateway/src/agents/runtime.ts` (por tool_call).  
Evaluación: `gateway/src/tools/safety.ts`.  
Policy de datos: `DEFAULT_TOOL_POLICY` / `AgentDefinition.toolPolicy`.

## Tools auditadas (producto actual)

| Tool | Decisión |
|------|----------|
| `filesystem.search` / `filesystem.read` / `filesystem.list` | ALLOWED |
| `office.excel.read` | ALLOWED |
| `agent.echo`, `math.*`, `system.info`, `diagnostics.ping`, `customer.demo` | ALLOWED |
| `filesystem.write` / `filesystem.delete` | CONFIRMATION_REQUIRED |
| `office.excel.write` | CONFIRMATION_REQUIRED |
| `process.execute` | CONFIRMATION_REQUIRED |
| `customer.test` (omitida) | DENIED |
| desconocida / no en policy | DENIED (`unknown_tool_deny_by_default`) |

No se inventaron tools nuevas (terminal/keyboard/mouse, etc.).

## HITL

Reutiliza `ConfirmationPort` / `ConfirmationWaiter`:

- una aprobación = un `confirmationId` (one-shot);
- input congelado en servidor;
- claimant = WS `sessionId` + `deviceId`;
- sesión AuthSession revocada → WS kill / `requireActiveAuthSession` → no puede aprobar.

## UserContext

`evaluateToolSafety` recibe `userContext` para binding/diagnóstico.  
**`deviceId` no cambia la decisión** (mismo owner = misma safety).  
**No** usa `HUB_TOKEN` como identidad.

## Diagnostics

Evento `TOOL_POLICY_DECISION` (stage `TOOL_SELECTION`): tool, decision, reason, sessionId, deviceId?, userId?, agentId?. Sin secretos.

## Por qué no es RBAC

- Sin roles admin/editor/viewer.
- Sin permisos distintos PC vs Android.
- Policy = seguridad de **acciones del agente**, no jerarquía entre Devices.

## CapabilityExecutor (backstop)

```text
Tool Safety Policy (evaluateToolSafety)
        ↓ AUTHORITATIVE SECURITY DECISION
AgentRuntime (HITL / execute / deny)
        ↓
CapabilityExecutor.authorize
        ↓ technical backstop (omit → denied)
execute
```

CapabilityExecutor **no** redefine ALLOWED/CONFIRM; solo niega capabilities ausentes en policy.

## Fuera de alcance (57.8+)

- Policy editor UI / security center  
- Policy remota / por Node  
- OAuth / multi-user  
- Crypto Device/Node  

**PHASE 57.7:** remote/LAN opt-in **no** altera Tool Safety.  
Ver [`remote-access.md`](./remote-access.md).

## Tests

`gateway/tests/tools/phase57-5-tool-safety.test.ts`  
`gateway/tests/tools/phase57-6-policy-authority.test.ts`  
`gateway/tests/identity/phase57-7-remote-access.test.ts` (remote ≠ bypass)
