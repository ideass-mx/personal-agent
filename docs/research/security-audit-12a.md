# Etapa 12A — Auditoría de seguridad Hub → MCP → Agent → OS

**Fecha:** 2026-08-23  
**Alcance:** código real de `hub/` y `agent/` tras 11C. Sin Guardian, PermissionManager, PolicyEngine, sandbox, tercer proceso ni mitigaciones nuevas.  
**Arquitectura:** Hub + Agent + MCP stdio. Nada más.

Esta etapa **documenta** el modelo de amenaza y cierra huecos de tests de
regresión. No cambia producción.

## Principio

El Agent **no** es frontera contra quien controla la máquina (mismo uid,
stdin del proceso, filesystem local). Protege el camino
**LLM → Hub → confirmación → MCP → OS** frente a:

- el modelo (prompt injection, tool_calls no autorizados);
- un cliente WS autenticado que intente mutar `confirm_response`;
- MCP malformado o desincronizado;
- paths/symlinks accidentales respecto a `filesystem.root`.

No protege frente a: root/admin local, malware local, quien lance
`npm run agent` y escriba MCP en stdin, ni carreras TOCTOU same-host.

---

## 1. MCP / invocación directa del Agent

**Hecho.** `agent/src/index.ts` abre `StdioServerTransport`. No hay HTTP,
WebSocket ni auth en el Agent. Quien sea el padre del proceso controla
stdin = canal MCP.

**Descubrimiento.** `tools/list` expone todas las tools del registry
(`createDefaultExtensions()`): `agent.echo`, `filesystem.read|list|write`,
`process.execute`, `math.*`, `system.info`, `diagnostics.ping`. El
descriptor MCP **no** incluye `executionMode`.

**Ejecución.** `tools/call` invoca `tool.execute` de inmediato. El Agent
**no** confirma. No hay `confirmationId` en el envelope MCP
(`requestId` + `context` + `input`). No hay forma de “hacer creer” al
Agent que el Hub aprobó: el Agent no participa en confirmation.

**Falsificar confirmationId / executionMode por MCP.** Irrelevante en el
Agent: no los lee. El Hub ignora cualquier `executionMode` del listado MCP
y usa `DEFAULT_TOOL_POLICY`.

**Tool no registrada.** MCP SDK / `registerTool(name)`: nombre desconocido
falla. No hay fallback in-process en el Hub (`createMcpRemoteExecutor`: un
intento, sin retry).

**Conclusión:** **D + B.** Comportamiento esperado de un servidor MCP
stdio **y** riesgo aceptado del modelo de confianza local. **No** es
bypass remoto del Hub. No es vulnerabilidad crítica de producto mientras
el Agent no se exponga en red. Packaging: el binario `dist/agent/agent.cjs`
es local; quien lo ejecute a mano obtiene las mismas tools.

---

## 2. Confirmation bypass (Hub)

Código: `hub/src/agent/confirmation.ts`, `runtime.ts`, `http/ws.ts`,
protocolo `confirm_response` = `{ confirmationId, approved }`.

| Caso | Resultado |
|------|-----------|
| reject | 0 execute / 0 MCP |
| timeout | 0 execute |
| cancel (`cancelAll` / drop WS) | 0 execute |
| `confirmationId` inexistente | `respond` → false; pending intacto |
| doble approve | segundo `respond` → false; 1 execute |
| approve tras reject/timeout | false; 0 execute extra |
| payload extra en `confirm_response` | Zod strip; WS no pasa toolName/input |
| mutar `confirm_request` en el cliente | execute usa `FrozenConfirmationOperation` del servidor |
| otra sesión/device/conversation | `claimantMatches` fail-closed; pending no se toca |
| `requestId` MCP | lo genera el Hub por llamada (`rt_*`); el Agent lo ecoa; mismatch → error, no execute de otra tool |

**Conclusión:** no hay bypass de confirmation en el camino LLM→Hub.
`executionMode` lo decide el Hub. Las extensions no confirman.

---

## 3. MCP fail-closed

`createMcpRemoteExecutor`: JSON inválido, `requestId` distinto, ToolResult
mal formado, timeout, disconnect, `isError` MCP → `ok: false`. Sin retry.
Sin ejecutar in-process. `createRemoteAgentTool` vuelve a exigir
`response.requestId === requestId`.

Stdout del Agent = transporte SDK; logs en stderr. Hijo de
`process.execute`: `stdio: ['ignore','pipe','pipe']` (no hereda stdout MCP).

**Conclusión:** fail-closed. Cubierto en 7G/8C/8D; 12A añade chequeo de
`executionMode` ausente en `tools/list` y de requestId cruzado.

---

## 4. Filesystem

`resolveSafePath` + `path.relative` (no `startsWith`) + walk `lstat` /
`realpath` de cada componente.

| Cubre | No cubre |
|-------|----------|
| `../`, absoluto fuera, hermano, prefijo `root-secret` | TOCTOU entre `realpath` y `writeFile`/`readFile`/`readdir` |
| symlink cuyo target real está fuera | sustituir un componente por symlink **después** de la validación (same-host) |
| root que no es directorio | `openat` / `O_NOFOLLOW` / operaciones por fd |
| `foo/../bar` léxico | atacante local con write en un dir intermedio |

**TOCTOU:** explotable solo con capacidad local de modificar el árbol
durante la ventana. No es remoto. No salta el Hub. `filesystem.write`
sigue exigiendo confirm en el Hub. **No se cierra en 12A** (haría falta
fd-based I/O, no una capa nueva).

---

## 5. `process.execute`

`spawn(command, args, { shell: false, stdio: ['ignore','pipe','pipe'] })`.
No hay `shell.execute`, `process.run`, jobs, stdin, PTY ni overlay `env`
del LLM. `timeoutMs` 1s–120s (default 30s). stdout/stderr ≤ 64 KiB.
`ok: true` con `exitCode != 0`. Timeout (12A): SIGTERM + SIGKILL al **pid**
del hijo. **12B (POSIX):** SIGTERM/SIGKILL al process group `kill(-pid)`
del spawn (`detached` sin `unref`). **12B (Windows):** sigue el pid raíz;
sin Job Objects (limitación, no ProcessManager).

`bash -c` / `sh -c` / `cmd.exe` / `powershell` **explícitos** en
`command`+`args` **sí** corren si el humano confirma. Eso no es escape
automático de shell; es argv.

**Huérfanos:** 12B cierra nietos que permanecen en el grupo. Quien haga
`setsid`/daemonize **sigue** pudiendo escapar. Windows: nietos pueden
sobrevivir.

---

## 6. Secretos y output

`filesystem.read` y `process.execute` devuelven bytes al LLM (truncados).
Pueden incluir `.env`, tokens, `printenv`, salida de CLI. **No** es un
bypass de confirmation: `read` es `automatic` (diseño); `execute` es
`confirm`. Es consecuencia de autorizar la tool + superficie de prompt
injection. Sin redacción en v1.

---

## 7. Prompt injection

Contenido de archivo o stdout **puede** intentar “ignora la política”.
Eso **no** salta `executionMode: confirm` en el Hub: el runtime no ejecuta
write/execute sin pending aprobado. El modelo **sí** puede *pedir* más
tools; write/execute siguen pidiendo humano. Distinción: engaño al LLM ≠
bypass de confirmation.

---

## 8. Agent Extensions

Contrato `{ name, version?, tools }`. Sin `executionMode` en la extensión.
Namespace fail-closed; duplicados fail-closed; MCP no READY si el registry
no se construye. Bundle estático (`import` fijo). Una extensión compilada
tiene los privilegios del proceso Agent. **AgentExtension no es sandbox.**
Modelo: código first-party de confianza de build.

---

## 9. Lifecycle

Hub: spawn Agent → MCP initialize → `tools/list` → `ready = true` →
`[hub] READY`. Crash en startup → no READY. Crash después → disconnect,
confirmaciones `cancelAll`, tools fallan, sin retry/fallback. Shutdown
idempotente (flags `stopping`). Señales SIGINT/SIGTERM. Sin auto-restart.

---

## 10. Packaging

`resolveAgentLaunch`: layout en disco (`dist/hub` → `../agent/agent.cjs`),
no `cwd` ni `NODE_ENV`. Launchers Unix/Windows. Sin Guardian /
PermissionManager / PolicyEngine / Sandbox / AgentManager.

---

## 11. Threat model

| Riesgo | Impacto | Acceso local | Bypass Hub | Estado |
|--------|---------|--------------|------------|--------|
| MCP directo al Agent | write/execute sin UI | Sí (stdin) | No (no pasa por Hub) | **ACCEPTED** |
| Confirmation bypass (WS) | write/execute no autorizado | Cliente autenticado | Intentado; bloqueado | cubierto (no hallazgo) |
| MCP spoofing / requestId cruzado | execute ajeno | Canal MCP | No | fail-closed |
| Filesystem traversal léxico | leer/escribir fuera | Tool filesystem | No | cubierto |
| Symlink fuera de root | igual | Tool filesystem | No | cubierto (walk) |
| Filesystem TOCTOU | escape root | Same-host + race | No | **ACCEPTED** (KNOWN) |
| Shell escape automático | RCE shell | execute confirmado | No | cubierto (`shell:false`) |
| `bash -c` explícito | shell real | execute + humano | No | **ACCEPTED** |
| Process orphan / nietos | procesos vivos | execute | No | **ACCEPTED** (KNOWN) |
| Secretos en stdout/read | fuga al LLM | tools | No | **ACCEPTED** |
| Prompt injection | más tool_calls | contenido | No (confirm intacto) | **ACCEPTED** |
| Extensión maliciosa en bundle | privilegios del Agent | build | N/A | **ACCEPTED** (trust de build) |
| Agent crash | DoS local | — | No | fail-closed |
| Agent tampering (binario) | control total | disco local | N/A | **ACCEPTED** |

Severidades abiertas: ninguna **CRITICAL**/**HIGH** remota. MEDIUM = MCP
stdio local (aceptado). LOW/KNOWN = TOCTOU, huérfanos, secretos, injection.

---

## 12. Preguntas por hallazgo

| Hallazgo | ¿Explotable? | ¿Quién? | ¿Salta Hub? | ¿Sin confirm? | ¿Remoto? | ¿v1? | ¿Mitigar ahora? |
|----------|--------------|---------|-------------|---------------|----------|------|-----------------|
| MCP stdio directo | Sí, local | Padre del proceso | No aplica | Sí, en ese canal | No | Aceptado | No |
| TOCTOU path | Sí, local race | Mismo host | No | write sigue confirm | No | Aceptado | No (fd I/O después) |
| `bash -c` | Sí, si se confirma | Usuario | No | No | No | Aceptado | No |
| Huérfanos | Parcial | OS | No | No | No | POSIX 12B; Windows/setsid KNOWN | 12B grupo POSIX |
| Secretos al LLM | Sí, tras tool | LLM | No | read automatic | No | Aceptado | No (redact después) |
| Prompt injection | Influencia, no bypass | Modelo | No | No para confirm | Parcial (contenido) | Aceptado | No |

---

## Estados (criterio 14)

1. **Hallazgos:** modelo local documentado; sin bypass Hub→confirm→MCP.
2. **Vulnerabilidades reales (remotas / bypass Hub):** ninguna.
3. **Riesgos aceptados:** MCP stdio, TOCTOU, `bash -c`, huérfanos, secretos, injection, trust de bundle.
4. **Tests 12A:** `agent/tests/security/audit-12a.test.ts`, `hub/tests/security/audit-12a.test.ts`, extra fields en `confirm-messages`.
5. **Tests previos:** confirmation-hardening, 7G filesystem, 8C audit, process-execute, 8D MCP, 9A lifecycle, 11A–11C extensions.
6. **Cambios de producción:** cero.
7. **Confirmation:** fail-closed, binding sesión/device, input congelado.
8. **MCP:** fail-closed, un intento, requestId.
9. **Filesystem:** contención léxica + symlink walk; TOCTOU abierto a propósito.
10. **process.execute:** `shell:false`; huérfanos documentados.
11. **Extensions:** estáticas; no sandbox; no `executionMode`.
12. **Lifecycle:** READY tras `tools/list`; sin retry.
13. **Packaging:** layout relativo; sin procesos extra.

## Etapa 12B (posterior a esta auditoría)

Process group POSIX en timeout/shutdown/disconnect. Windows: pid raíz,
sin Job Objects. Riesgo restante: `setsid` y nietos en Windows.

Siguiente higiene (no arquitectura): I/O por fd (TOCTOU) o redacción de
secretos.
