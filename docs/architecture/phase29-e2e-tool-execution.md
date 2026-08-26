# PHASE 29 — End-to-End Tool Execution Audit

**Estado:** PHASE 29 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

Una Tool real puede recorrer Runtime → MCP → Node → resultado (probado).  
Android Hub → WS → confirm HITL está cableado (PHASE 28).  
Smoke empaquetado ejecuta `filesystem.read`.  
No hay B/C bloqueante de ejecución. Deuda: schema de negocio no llega al LLM; HITL solo con ChatScreen activo; timeout no aborta trabajo en Node; health snapshot.

**PHASE 30 NOT STARTED.** Código productivo: ninguno.

---

## 1. Executive Summary

El inventario productivo son **14 Tools** en el Local Node (MCP), filtradas por `DEFAULT_TOOL_POLICY` en discovery. No hay Tools in-process en el Gateway. La evidencia de ejecución no es un único test “teléfono → Anthropic → Excel”; es la composición de:

| Capa | Evidencia |
|------|-----------|
| FakeLLM → Runtime → confirm → MCP → Node | `hub/tests/agent/e2e-8d.test.ts` |
| stdio real + filesystem/process | `filesystem-*-process.test.ts`, `mcp-process.test.ts` |
| Policy deny-by-default | `tool-policy.test.ts`, `discover.ts` |
| HITL Android decode/UI/send | `HubChatConnection`, `ChatScreen`, `HubConfirmProtocolTest` |
| Paquete | `smoke:package` → `tools/list` + `filesystem.read` |

---

## 2. Real Tool Inventory

Todas viven en `agent/` vía Extensions → MCP Server. `executionMode` efectivo = **Hub policy** (campo AgentTool es legado).

| Tool | Mode (policy) | Policy | Node | Side effect | Result |
| ---- | ------------- | ------ | ---- | ----------- | ------ |
| `agent.echo` | automatic | yes | MCP | none | `{ text }` |
| `filesystem.read` | automatic | yes | MCP | read FS | content / error |
| `filesystem.list` | automatic | yes | MCP | read FS | entries |
| `filesystem.write` | confirm | yes | MCP | write FS | ok / error |
| `process.execute` | confirm | yes | MCP | spawn process | stdout/stderr/exit |
| `math.add` | automatic | yes | MCP | none | number |
| `math.subtract` | automatic | yes | MCP | none | number |
| `math.multiply` | automatic | yes | MCP | none | number |
| `math.divide` | automatic | yes | MCP | none | number / div0 |
| `system.info` | automatic | yes | MCP | none | platform info |
| `diagnostics.ping` | automatic | yes | MCP | none | ping |
| `customer.demo` | automatic | yes | MCP | none | demo payload |
| `office.excel.read` | automatic | yes | MCP | Excel COM (Win) | range values |
| `office.excel.write` | confirm | yes | MCP | Excel COM write | rows/cols |

**No en bundle default:** `customer.test` (archivo tool sin Extension en `defaults.ts`) — no discovery.

Timeouts MCP Hub: default 15s; `process.execute` = timeoutMs+5s (1–120s); Office Excel = 20s.

---

## 3. Discovery Audit

```text
Node registry.list → MCP registerTool(name, remoteEnvelope)
→ tools/list
→ registerDiscoveredAgentTools
→ assertListedAgentTools + assertToolPolicyAnnounced
→ policy[name] ? register RemoteAgentTool : omit
```

- Required: `filesystem.read|list|write`, `process.execute` deben estar listadas **y** en policy.
- Nombre inválido / duplicado / schema MCP no-objeto → `mcp_discovery_error` fail-closed.
- Tool en list sin policy → omit (deny).
- Policy key no anunciada → `tool_policy_error`.
- Lista vacía → falla required tools.
- **Schema negocio:** MCP anuncia envelope `{requestId,context,input}`; Hub registra `GENERIC_INPUT_SCHEMA` (`additionalProperties: true`). El `AgentTool.inputSchema` **no** llega al LLM. Validación real en `AgentTool.execute`. **E-29-01.**

---

## 4. Automatic Tool E2E

**Representante:** `filesystem.read` / `agent.echo`.

Evidencia: `e2e-8d` «A: filesystem.read automatic → 0 confirm, 1 MCP, done»; `filesystem-read-process`; smoke package lee `nota.txt`.

Sin confirmación. Resultado JSON → Runtime → LLM loop → (producto) chunks WS.

---

## 5. Confirmation Tool E2E

**Representante:** `filesystem.write` / `process.execute`.

Gateway: `e2e-8d` + confirmation tests (approve → 1 execute; reject/timeout → 0). Binding Session; Node death cancela.

Android: `confirm_request` → `ChatInbound.ConfirmRequest` → diálogo → `confirm_response`. **D-29-01:** diálogo solo si `ChatScreen` está compuesto (si usuario está en Sessions, timeout 60s).

---

## 6. Arguments / Schema

Viaje: LLM input → `RemoteAgentTool` JSON-clone → MCP `arguments.{requestId,context,input}` → Node `tool.execute(input)`.

Validación: Node (y Zod envelope MCP). Hub no revalida schema de negocio. Unicode/JSON-safe: clone falla → `remote_tool_error`.

---

## 7. Result propagation

Node `ToolResult` → JSON text MCP → parse envelope `requestId` → Runtime `tool_result` al LLM → `assistant_chunk`/`done` al cliente. Errores `ok:false` como `isError` al LLM. Contenido grande: límites por tool (p. ej. process 64KiB).

---

## 8. Error propagation

| Caso | Comportamiento |
|------|----------------|
| tool not in registry | `tool_not_found` |
| invalid args | Node `invalid_input` |
| exception | `toolExceptionResult` / `tool_exception` |
| MCP malformed | `remote_tool_error` |
| disconnect | `agent_disconnected` |
| timeout | `remote_tool_timeout` |

Turno no bloquea indefinido (timeout MCP / confirm 60s). No se expone `ANTHROPIC_API_KEY` en errores de tool.

---

## 9. Timeout

`MCP_TOOL_TIMEOUT_MS=15000`; process/Excel holgados. Gateway libera Promise. Node **puede seguir** tras timeout (**E**, aceptado PHASE 26/27). Sin abort.

---

## 10. Filesystem

`resolveSafePath` + `AGENT_FILESYSTEM_ROOT`. Rechaza `..`, fuera de root, symlink escape. Sin root: legado (cwd, rechaza `..`). TOCTOU documentado. Tests security/filesystem. **No C** de traversal demostrable en API actual.

---

## 11. Office / Excel

`office.excel.read` automatic; `write` confirm. Schema: sheet/range/values; workbook opcional. Windows COM; timeouts 15s COM / 20s MCP. Tests Hub agent office-*. Sin Excel en CI Linux: mock/skip IT.

---

## 12. Side Effects

Read-only: echo, math, system, diagnostics, customer.demo, fs.read/list, excel.read.  
Mutating + confirm: fs.write, process.execute, excel.write. Alineado con policy.

---

## 13. Tool Policy

Deny-by-default. Tool no en policy no entra en ToolRegistry → Runtime `get` undefined → no `callTool`. **No** hay ruta Gateway→MCP sin registry. Bypass solo spawn stdio al binario agent (frontera proceso, no C de producto).

---

## 14. MCP Boundary

Solo stdio. Sin TCP/HTTP MCP. `childEnvForLocalNode` (PHASE 28) no pasa secretos Gateway.

---

## 15. Node Death

`onclose` → disconnect + cancel confirms; execute fail-closed; sin respawn. Tests lifecycle-9a.

---

## 16. Gateway Restart

Nuevo spawn + discovery; SQLite Conversation/Workspace/Messages persisten; Session/confirm/registry efímeros; AgentDefinition recreado.

---

## 17. Android Restart

`conversationId` = sessionKey; Workspace vía HTTP GET. HITL vuelve al abrir Chat. Historial Hub local DataStore (no GET messages) — deuda PHASE 27.

---

## 18. Packaging

`smoke:package`: handshake, tools/list (14 names), `filesystem.read` packaged. Migrations en dist.

---

## 19. Security

| Pregunta | Respuesta |
|----------|-----------|
| Tool no autorizada vía Runtime | No |
| Escape filesystem root | No (con root) |
| Secretos Gateway en Node env | No (PHASE 28) |
| MCP externo | No (stdio) |
| Skip confirmation | No (fail-closed) |
| conversationId arbitrario | Sí con mismo HUB_TOKEN (modelo hogar, no C) |

---

## 20. Test Coverage

Cubierto: discovery, policy, automatic, confirm Hub, args Node, MCP, Node death, filesystem, Excel (mock), smoke.  
Hueco: E2E dispositivo+Anthropic+Excel real; HITL con Chat no visible; schema LLM fidelity.

---

## 21. Findings A–G

| ID | Finding | Classification | Severity | Evidence | Code required |
| -- | ------- | -------------- | -------- | -------- | ------------- |
| A-29-01 | Cadena Runtime→MCP→Node ejecuta Tools | A | Info | e2e-8d, process tests, smoke | No |
| A-29-02 | Policy deny; confirm mutating | A | Info | tool-policy, discover | No |
| A-29-03 | Path containment con root | A | Info | safe-path, security tests | No |
| A-29-04 | HITL Android cableado | A | Info | HubChatConnection, ChatScreen | No |
| E-29-01 | Schema negocio no llega al LLM | E | Medium | discover GENERIC_INPUT_SCHEMA; MCP remoteEnvelope | No ahora |
| E-29-02 | Timeout no aborta Node | E | Low | mcp-executor | No |
| E-29-03 | Health snapshot | E | Medium | PHASE 26 | No |
| D-29-01 | HITL solo con ChatScreen | D | Medium | PHASE 28 debt | Opcional |
| D-29-02 | Historial Hub no rehidrata SQLite | D | Medium | PHASE 27 | Opcional |
| F-29-01 | customer.test sin Extension | F | Low | customer-test.ts vs defaults | No |
| G-29-01 | Abort/cancel Tool | G | Info | — | No |

**B:** ninguno. **C:** ninguno.

---

## 22. Critical Risks

Ninguno bloqueante de ejecución. Riesgo operativo: confiar en `/health.agentReady` tras crash Node; HITL ausente fuera de Chat.

---

## 23. Non-blocking Debt

E-29-01..03, D-29-01..02, shutdown vs WS, nombres `attachLocalAgent`.

---

## 24–26. Files

**Created:** este doc; `hub/tests/architecture/phase29-e2e-tool-execution.test.ts`  
**Modified:** terminology, boundaries, refactor-plan  
**Deleted:** none  

## 27. Productive code

**NONE**

## 28–32. Validation

- Architecture PHASE 29: **PASS** (4)
- `e2e-8d` + `mcp-stdio-env`: **PASS** (16)
- typecheck / build / smoke:package: **PASS**
- Android assembleDebug (+ unit tests): **PASS**
- `npm test` full suite: puede ser **ENVIRONMENTAL** (Node ABI sqlite / glob tsx)

## 33. Recommendation

Sí: una Tool real recorre de forma confiable Gateway Runtime → MCP → Node → resultado, y Android puede enviar/recibir chat + HITL confirm.  
No existe B/C que deba corregirse antes de continuar.

## 34. PHASE 30

`NOT STARTED`
