# PHASE 63.1 — AUDIT (Capability Semantics Clarification)

Fecha: 2026-09-04.

## Gap tras PHASE 63

PHASE 63 introdujo CapabilityIndex / ExecutionTarget / ToolImplementation, pero:

1. **No** distinguía explícitamente *implementation kind* (`native` | `mcp` | `remote`) del *transport* ni del *ExecutionTarget*.
2. El sync local usaba `transport: "mcp/stdio"` sin marcar que las tools del Node son **native** alcanzadas vía MCP — riesgo de leer `MCP === Node` o `native === Gateway`.
3. Docs/tests no fijaban la matriz dimensional ni los anti-ejemplos (`native === Gateway`, `remote === HTTP`, etc.).

## Riesgo

Colapsar dimensiones al implementar PHASE 64 (routing):

```text
native = Gateway   (incorrecto)
MCP = Node         (incorrecto)
remote = HTTP/MCP  (incorrecto)
Capability = target (incorrecto)
```

## Decisión

Hardening semántico mínimo:

- Campo `implementationKind` en `ToolImplementation`.
- Endurecer `assertCapabilityId` (sin transport / sin identidad de target).
- Documentación + tests de fixtures A–D y anti-equivalencias.
- **Sin** routing, transports nuevos, ni cambios a Artifact/ObjectStorage/CredentialManager.
