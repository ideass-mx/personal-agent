# PHASE 26 — Node Lifecycle / Resilience Audit

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Clasificación: A — Lifecycle correcto para Single Node; no hace falta cambio productivo.**

Fail-closed ya está en el código (Etapa 9A). No hay requisito de producto de respawn, heartbeat ni supervisor. No se introduce NodeRegistry, `nodeId`, recovery distribuido ni PHASE 27.

---

## 1. Startup (orden real)

```text
createDefaultAgentDefinition + ToolRegistry vacío
  → attachLocalAgent
       → connectAgentStdioClient (spawn + client.connect / initialize)
       → createMcpRemoteExecutor
       → registerDiscoveredAgentTools (listTools + toolPolicy)
       → ready = true  (handle LocalAgent)
  → [opcional HUB_HANDSHAKE_ONLY → shutdown y return]
  → Anthropic + createAgentRuntime + SQLite memory/workspaces
  → startServer (HTTP/WS) con extras copiados
  → [hub] READY
  → SIGINT/SIGTERM once
```

| Paso que falla | Comportamiento | Fail-closed |
|----------------|----------------|-------------|
| Spawn (ENOENT/EACCES) | `HubAgentError` `agent_spawn_error`; `main` `process.exit(1)`; no HTTP | Sí |
| MCP initialize | `mcp_initialize_error` o `agent_startup_error`; transport cerrado | Sí |
| `tools/list` / policy / required tools | `mcp_discovery_error`; `session.close()`; no READY | Sí |
| Tras attach, p. ej. provider LLM | `catch` de `main` sale 1 **sin** `agent.shutdown()` explícito | Aceptable: al morir el padre se cierran pipes stdio; el Node debería salir. Deuda menor, no supervisor. |

No hay retry ni segundo spawn. HTTP **no** arranca si attach falla.

---

## 2. READY (proceso vivo)

`LocalAgentHandle.ready` es un getter: `ready && !disconnected`. Tras `markDisconnected`, el handle pasa a no-ready.

`startServer` recibe `agentReady?: boolean`. `index.ts` pasa `agent.ready` **evaluado una vez**. `/health` **no** vuelve a leer el getter.

Conclusión: **`agentReady: true` en `/health` significa «el handshake de startup ocurrió»**, no «el Node y el MCP Server están vivos ahora». El catálogo `agentTools` es la lista de discovery, no un probe.

El Runtime no consulta health. La ejecución usa `isDisconnected` + `callTool`.

---

## 3. Muerte del Node después de READY (caso crítico)

```text
Gateway READY, WS autenticado
  → proceso agent/ muere o se cierra stdin/stdout MCP
  → StdioClientTransport onclose
  → markDisconnected
       → cancelAllConfirmations()  (si ya había READY y no es shutdown)
       → onDisconnected opcional  (index.ts NO lo registra)
  → cliente WS sigue abierto
  → user_message → runTurn → tools.get sigue encontrando RemoteAgentTool
  → execute → AGENT_DISCONNECTED o remote_tool_error (sin retry)
  → el LLM ve tool_result isError; el usuario no recibe un código WS `node_down`
```

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué detecta primero? | Cierre del transport MCP (`onclose`), o el siguiente `callTool` si hay carrera. |
| ¿Qué ve el Runtime? | `ToolResult` `ok: false` (`agent_disconnected` / `remote_tool_error` / timeout). No excepción de topología. |
| ¿Qué ve el usuario? | Turno que puede completar con error de tool en el hilo, o `error` interno si falla el LLM. El socket no se corta. |
| ¿Siguen las tools en el registry? | Sí. No hay segundo `tools/list`. `/health` `agentTools` no cambia. |
| ¿`/health`? | `ok: true`, `agentReady` sigue el snapshot de boot (típicamente `true`). |
| ¿El Gateway acepta mensajes? | Sí. WS es independiente del hijo. |
| ¿Confirmación pendiente? | `cancelAll` → `confirmation_cancelled` en el turno. |

Esto es el diseño 9A (fail sin retry), no un hueco que exija recovery.

---

## 4. Fallo de Tool

- Excepción en el Node: `toolExceptionResult` en el MCP Server; envelope JSON; Gateway lo parsea.
- Excepción en `RemoteAgentTool` / Runtime: `executeToolSafe` → `tool_exception`.
- `callTool` MCP inválido: `remote_tool_error`.
- Duración indefinida: **no**. `MCP_TOOL_TIMEOUT_MS` = 15s (más holgura en `process.execute` y Excel). `withTimeout` + timeout del SDK. El Gateway no espera forever.
- Tras timeout el trabajo en el Node **puede seguir** (no hay cancelación cooperativa de la Tool). Deuda de producto, no heartbeat.

Un intento, sin fallback in-process.

---

## 5. Confirmación

- Waiter en RAM, bound a Session WS, timeout 60s.
- Caída WS: `dropSession` → `cancelAll`.
- Caída Node: `markDisconnected` → `cancelAllConfirmations`.
- Shutdown de turno: `reply` `finally` → `waiter.cancelAll()`.
- Approve después de Node muerto: `execute` fail-closed (`agent_disconnected`).

No hay persistencia de confirmaciones.

---

## 6. Shutdown

Orden en `index.ts` (handlers `process.once`):

```text
SIGINT / SIGTERM
  → stopping guard (no double handler)
  → http.close()   // nodeServer.close: deja de aceptar; espera conexiones existentes
  → agent.shutdown()  // idempotente; cierra cliente MCP → Node onclose → abort process.execute + Excel + mcp.close
  → process.exit(0)
```

El Node también tiene SIGINT/SIGTERM propios; el camino normal es EOF stdio desde el padre.

**Riesgo real (deuda, no PHASE 26 code):** `http.close()` puede **bloquear** mientras hay clientes WS (conexiones HTTP upgraded). No se llama `ws.close`/`terminate` sobre el `WebSocketServer`. Los tests 9A de señales usan `hold-agent.ts` **sin** HTTP. No se introduce un supervisor para esto.

`attachLocalAgent.shutdown` es idempotente (`shutdownOnce`). Handlers de señal del Hub son `once`.

Promesas de `runTurn` en vuelo: `process.exit` las corta. Confirmaciones: cancel al close de sesión si el close llega; si `exit` es inmediato tras un `close` colgado, el proceso no llega a `exit`.

---

## 7. Restart del Gateway

| Estado | Tras restart |
|--------|----------------|
| Conversation / messages | Persistente (SQLite `TurnMemory`) |
| Workspace | Persistente (store SQLite) |
| Tool policy / AgentDefinition | Efímero: se recrea `createDefaultAgentDefinition()` |
| Session WS | Muere; el cliente debe `auth` de nuevo |
| Confirmation | Muere (RAM) |
| ToolRegistry | Nuevo discovery MCP |
| Proceso Node | Nuevo spawn |

No hay continuidad de MCP ni de Session.

---

## 8. Persistente vs efímero

**Persistente:** SQLite (conversaciones, mensajes, workspaces, devices tocados).

**Efímero:** proceso Node, MCP, ToolRegistry Gateway, Runtime, Session, ConfirmationWaiter, `agentReady` de health, Excel COM, hijos de `process.execute`.

---

## 9. Riesgos reales (documentar, no implementar)

1. `/health.agentReady` es snapshot.
2. `index.ts` no usa `onDisconnected` (ni log ni health live).
3. Catálogo MCP congelado tras discovery.
4. Timeout MCP no aborta la Tool en el Node.
5. `server.close()` vs WS persistentes.
6. Fallo post-attach sin `shutdown()` explícito (pipes suelen bastar).
7. SIGKILL del Node: nietos de `process.execute` según OS (ya 12B).

Ninguno exige NodeRegistry, heartbeat, ni respawn **ahora**. Recovery sería un requisito de producto explícito (operador que espera que el Hub se auto-repare sin restart). Ese requisito **no está** en el código ni en el roadmap de uso diario.

---

## 10. Clasificación

**A.** El lifecycle cumple fail-closed Single Node. **B** (bug mínimo) no se abre: health stale y WS-close son deudas conocidas, no rotura del contrato de ejecución. **C** (respawn) se rechaza: no hay consumidor.

---

## PHASE 27

No se inicia. Autorización explícita requerida. Candidatos futuros (solo si se piden): health live mínimo, cerrar WS en shutdown, o respawn **si** el producto lo exige. No Distributed.
