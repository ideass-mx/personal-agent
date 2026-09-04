# Arquitectura — MX Ideass · Personal Agent

Vocabulario de plataforma (PHASE 1 + 53):
[`terminology.md`](./architecture/terminology.md) y
[`boundaries.md`](./architecture/boundaries.md).
Validación post-rename: [`phase53.1-post-refactor-runtime-validation.md`](./architecture/phase53.1-post-refactor-runtime-validation.md).
Runtime canónico: [`phase54-canonical-runtime-field-validation.md`](./architecture/phase54-canonical-runtime-field-validation.md).
Modelo de Agent: [`phase55-agent-model.md`](./architecture/phase55-agent-model.md).
Skills & capabilities: [`phase56-skills-capabilities.md`](./architecture/phase56-skills-capabilities.md).

`gateway/` es la implementación del **Gateway** (legacy físico: `hub/`).
`node/` es el **Node** (MCP + Native Tools; legacy físico: `agent/`).
Entrypoints internos: `gateway/gateway.cjs` → `node/node.cjs` (shims `hub.cjs` / `agent.cjs` solo en bordes).
`Agent` = definición lógica (`AgentDefinition.id`); ≠ `agentId` de instalación; ≠ proceso Node.
`Skill` = instrucciones reutilizables; `Tool` = capacidad ejecutable (PHASE 56).

Identidad y pairing (PHASE 52):
[`phase52-pairing-trusted-device.md`](./architecture/phase52-pairing-trusted-device.md)
— Agent Identity (`agentId`) ≠ Pairing Session ≠ Trusted Device ≠ Session Auth.
`HUB_TOKEN` es solo **legacy install credential** (no va en el QR).

## Principio rector
Nada se conecta directo a nada: **todo pasa por el Gateway (`gateway/`)**.
Los dispositivos son puntos de entrada/salida; el **Node** (proceso local)
ejecuta capacidades en la PC; el Gateway piensa, confirma y enruta.

**Gateway = cerebro del sistema. Node = garras (proceso local multiplataforma).**

En una frase: el Gateway piensa y coordina; el Node ejecuta las capacidades
locales de la máquina; MCP (bajo Tools) conecta ambos.

## Nomenclatura (no confundir)

| Nombre | Qué es | Dónde vive |
|--------|--------|------------|
| **Gateway** | Cerebro: Agents/Runtime, Memory, ToolRegistry, Confirmation, HTTP/WS, Pairing | `gateway/` (legacy: `hub/`) |
| **Node** | Proceso local: MCP Server, Native Tools | `node/` (legacy: `agent/`) |
| **Agents / AgentRuntime** | Lógica de turno LLM dentro del Gateway (no es el proceso Node) | `gateway/src/agents/` |
| **Mobile** | Cliente / interfaz móvil (Gateway Client) | `mobile/` (`mobile/android/` hoy) |
| **Desktop** | Supervisor / onboarding / Tailscale / Pairing UI | `desktop/` |
| **Protocol** | Contratos WS clientes ↔ Gateway | `packages/protocol/` |
| **Tool** | Capacidad ejecutable (`AgentTool`) | Gateway registry → MCP → Node |
| **Agent Extension** | Código local que aporta tools **dentro del proceso Node** | `node/src/extensions/` |

**`gateway/src/agents/` no es el programa `node/`.**

- `gateway/src/agents/` = **AgentRuntime** interno del Gateway (loop LLM ↔ tools ↔ confirmación).
- `node/` = programa local. Frontera de ejecución. Un solo Node multiplataforma.

**Plugin ≠ proceso. Agent ≠ Plugin. Agent Extension ≠ proceso.**
Una Agent Extension no es daemon, Guardian, sandbox ni Permission System:
es código empaquetado que registra tools en el `ToolRegistry` del Agent.

El Hub **no** ejecuta filesystem / shell. El Agent ejecuta
`filesystem.read` y `filesystem.list` (`automatic`) y
`filesystem.write` (`confirm` en el Hub).
`executionMode` es autorización interactiva en el Hub; el Agent valida
invariantes técnicos (input, tamaño, path, tipo de destino) y no confirma.
`filesystem.root` es configuración **local** del proceso Agent
(`AGENT_FILESYSTEM_ROOT`). No es Permission System: el Hub no decide paths
ni consulta el Agent para containment. Sin root: comportamiento legado
(sin contención). Con root: `resolveSafePath` mantiene la operación dentro
del root (segmentos / `path.relative`, no `startsWith`). Delete no hay.
`process.execute` está implementado en el Agent (Etapa 8B) y el Hub lo
adapta como RemoteAgentTool tras `tools/list` (Etapa 8D). No hay
Permission System ni PermissionManager. **No existe Guardian.**

## Vista actual → objetivo

```text
CLIENTES (Mobile / futuros)
        │  WebSocket (packages/protocol)
        ▼
┌───────────────────────────────────────┐
│            Hub (`hub/`)               │
│  WS · auth · sesiones                 │
│  AgentRuntime · LLMProvider           │
│  ToolRegistry · Confirmation          │
│  memoria / historial                  │
└───────────────────┬───────────────────┘
                    │
│         MCP stdio (Hub ↔ Agent)
                    │
                    ▼
┌──────────────────────────────────────────────┐
│         Agent (`agent/`)                     │
│  Core: lifecycle · registry · MCP · config   │
│  Extensions: echo · filesystem · process · math · system · diagnostics · customer │
└──────────────────────┬───────────────────────┘
                    │
                    ▼
                   OS
```

```text
              HUB
               │
        confirmación
               │
              MCP
               │
               ▼
             AGENT
               │
       ┌───────┴───────┐
       │               │
   Tool validation   OS execution
       │
   filesystem root
       │
       ▼
      disk
```

Hoy el Hub productivo registra `calculator` in-process. Al arrancar, el Hub
**hace spawn del Agent**, completa MCP `initialize` y `tools/list`, valida
tools y **entonces** se anuncia READY. Las garras del Agent
(`filesystem.read`/`list`/`write`, `process.execute`, `agent.echo`,
`math.add`/`subtract`, `system.info`, `diagnostics.ping`, `customer.demo`,
`office.excel.read`) se
adaptan a `RemoteAgentTool`. No se reimplementan en el Hub.
`filesystem.write` y `process.execute` usan `executionMode: confirm`
**antes** de MCP. Delete no está implementado.
El Hub no abre archivos ni hace `spawn` de negocio (el spawn es solo el
proceso Agent).

### Lifecycle (Etapa 9A)

El Hub posee el lifecycle del Agent local. El Agent es un proceso de
ejecución local. MCP stdio es el único transporte. **No hay tercer
proceso.**

```text
Hub start
  → spawn Agent
  → MCP stdio + initialize
  → tools/list
  → validar tools (fail-closed)
  → Agent READY
  → Hub READY
```

Shutdown: cerrar MCP → terminar Agent → esperar proceso → cleanup.
SIGINT/SIGTERM son idempotentes. Un Agent vivo no debe quedar tras un
shutdown normal.

Si el Agent muere: MCP detecta desconexión; las tools remotas fallan con
`agent_disconnected`; no hay retry ni fallback in-process; no se reinicia
el Agent en esta etapa. Confirmaciones pendientes se invalidan.

`tools/list` aporta capacidades (nombre, descripción, schema). El Hub
asigna `executionMode` (hardcodeado: read/list/echo `automatic`; write y
`process.execute` `confirm`). Ni el LLM, ni el Agent, ni el cliente MCP
deciden confirmación.

Configuración `AGENT_FILESYSTEM_ROOT` pertenece al Agent; el Hub solo
puede pasarla como env al spawn.

### Desarrollo vs producción (Etapa 9B)

**Desarrollo** (`tsx`, árbol de fuentes):

```text
Hub (tsx hub/src/index.ts)
  → spawn node + tsx + agent/src/index.ts
  → MCP stdio
```

**Producción** (JS compilado, sin tsx ni `agent/src`):

```text
node dist/hub/hub.cjs   (o ./dist/hub/hub)
  → spawn node dist/agent/agent.cjs
  → MCP stdio
```

La detección es por artefacto: si existe `../agent/agent.cjs` junto al
Hub compilado, se usa producción. Si no, desarrollo. No se usa
`NODE_ENV` como criterio.

**v1 requiere Node.js 22+ en el PATH.** No hay binarios nativos
standalone: el Hub depende de `better-sqlite3` (addon nativo). Node SEA
se descartó por eso y por MCP stdio. No hay Electron, Tauri, Docker ni
servicios OS.

Build / package (desde la raíz del repo):

| Comando | Qué hace |
|---------|----------|
| `npm run build` | Compila Hub y Agent a `dist/hub/hub.cjs` y `dist/agent/agent.cjs` |
| `npm run package` | Build + `better-sqlite3` + launchers Unix/Windows + `README.txt` |
| `npm run smoke:package` | Package + handshake MCP + `tools/list` + `filesystem.read` (sin API keys) |

Targets: Linux x64, Windows x64, macOS (x64/arm64) con Node del host.
No hay `.app`, notarización ni cross-compile en v1: hay que construir
en cada OS (sobre todo por `better-sqlite3`).

El Hub no depende del cwd: resuelve el Agent con `path.join` respecto
a su propio módulo. Paths con espacios son válidos. Windows no concatena
`"/"`.

Escritorio futuro: app → Hub → Agent. No está implementado.

Desarrollo diario: `npm run hub`. Sin API keys: `npm run hub:handshake`
(`HUB_HANDSHAKE_ONLY=1`).

### Agent Extension (Etapa 11A)

Término normativo: **Agent Extension**. «Plugin» es sinónimo informal.

**AgentExtension** = unidad estática de composición de capacidades del Agent.

**AgentTool** = capacidad ejecutable individual (`tool.name` público vía MCP).

**ToolRegistry** = registro de AgentTools provenientes de extensions.

**MCP** = protocolo que expone esas tools al Hub (`tools/list`, `tools/call`).

**Hub** = orquestador que descubre las tools y decide `executionMode` / confirmation.

**Agent Core** = infraestructura para ejecutar extensiones (lifecycle, registry, MCP, config, utilidades compartidas como `safe-path`).

**Agent Extension** = código que aporta `AgentTool[]` **dentro del proceso Agent**. No es proceso, MCP, Hub, Guardian ni Permission System. No accede a AgentRuntime. No decide confirmation. No define políticas globales. Solo crea un proceso extra si una tool concreta lo necesita (`process.execute`).

```text
                    HUB
                     │
                AgentRuntime
                     │
              executionMode
                     │
              confirmation
                     │
              RemoteAgentTool
                     │
                  MCP stdio
                     │
                     ▼
                   AGENT
                     │
               ToolRegistry
                     │
     ┌────────┬─────┴──────┬────────┬────────┬─────────┬──────────┐
     │        │            │        │        │         │          │
   echo   filesystem    process    math   system  diagnostics  customer  office
     │        │            │        │        │         │          │        │
 agent.echo read/...    execute  add/sub   info      ping       demo    excel.read
     │        │            │        │        │         │          │
     └────────┴─────┬──────┴────────┴────────┴─────────┴──────────┘
                     │
                  AgentTool
                     │
                     ▼
                     OS
```

Una Agent Extension es código integrado estáticamente en el Agent que
aporta una o más AgentTools. Una extension NO implica permisos
adicionales, aislamiento, sandbox, proceso independiente ni acceso
privilegiado.

El Hub decide `executionMode` vía Tool Policy; la extension no puede
decidir si una operación requiere confirmación.

**AgentExtension** hoy es un mecanismo **estático** de composición de
capacidades del Agent (código empaquetado en el bundle). **No** es un
sistema de plugins dinámicos: las extensions integradas no se cargan
desde filesystem, no se descargan, no tienen permisos ni sandbox propios,
no pueden modificar el Hub ni aprobar confirmations, y no crean procesos
adicionales (salvo que una tool concreta haga `spawn`, p. ej. `process.execute`).

Contrato (`agent/src/extensions/types.ts`):

```ts
interface AgentExtension {
  name: string;      // id corto: `echo` | `filesystem` | `process` | `math` | `system` | `diagnostics` | `customer` | `office`
  version?: string;
  tools: AgentTool[];
}
```

- Identidad de extensión: `echo` / `filesystem` / `process` / `math` / `system` / `diagnostics` / `customer` / `office`.
- Namespace de tool: `<extension>.<local>` (`filesystem.read`, `office.excel.read`).
  Excepción histórica: extensión `echo` → `agent.echo` (no se renombra).
- Registro: `createDefaultExtensions(config)` → `ToolRegistry.registerExtension` → MCP `tools/list`.
- Lista **estática**. No hay `import()` dinámico, marketplace, hot reload ni firma.
- Config: `AgentConfig` (p. ej. `filesystem.root`) se inyecta al crear filesystem/process.
- Extensión sin `tools`: válida y no-op.
- Nombre de extensión duplicado, tool duplicada, tool fuera de namespace o extensión inválida: **fail-closed** (no arranca MCP).
- El Hub no importa `AgentExtension`; solo ve `tools/list`.
- Confirmation sigue en el Hub (`executionMode`); las extensions no emiten `confirm_request`.
- Una AgentExtension vive **dentro del proceso Agent**: no es proceso, no tiene MCP propio, ni confirmation, ni políticas del Hub.

Escritorio futuro: app → Hub → Agent. No está implementado.

## Piezas

### Hub (`hub/` · Node.js / TypeScript) — el cerebro

Paquete npm: `@mxideass/hub`. Estructura plana por capacidad:
`http/ agent/ providers/ memory/ db/` (+ `tools/`).
`hub/src/agents/` es el AgentRuntime del cerebro, no el programa `agent/`.

**Responsabilidades (sí):**

- WebSocket con clientes, autenticación, sesiones
- `AgentRuntime`, `LLMProvider`, composición del turno
- `ToolRegistry` / tool calling
- **Confirmation** (`executionMode`, `confirm_request` / `confirm_response`,
  binding fail-closed)
- Historial / memoria conversacional
- Decidir *qué* tool ejecutar y *cuándo* (tras confirm si aplica)
- Enrutar tools remotas hacia **Agent** vía MCP
- Lifecycle del Agent local: spawn, handshake MCP, shutdown

**Responsabilidades (no):**

- Acceso directo a filesystem / shell / APIs privilegiadas del OS
  (eso vive en el **Agent**)
- Código específico de Windows / Linux / macOS dentro del `AgentRuntime`

### Mobile (`mobile/android/` · Kotlin/Compose)

Cascarón de entrada/salida. Un solo módulo `app`, paquetes planos:
`app/ protocol/ network/ service/ chat/` (+ `voice/` Fase 2, `assistant/`
Fase 3). Foreground service con WebSocket persistente; arsenal anti-HyperOS.
Fase 3: `VoiceInteractionService` + ROLE_ASSISTANT.

### Agent (`agent/`) — proceso local multiplataforma

**Agent** es el nombre del **proceso local** (producto). Node.js + TypeScript.
Un solo proyecto; no `agent-windows` / `agent-linux` / `agent-macos`.

| Agent **sí** | Agent **no** |
|--------------|--------------|
| Proceso independiente en la PC | Contener `AgentRuntime` |
| MCP server, registry, extensions (echo, filesystem, process, math) | Contener LLM / prompts |
| Futuro: acceso OS + adapters de plataforma | Administrar conversaciones WS |
| Empaquetado v1: JS + Node (`dist/hub`, `dist/agent`) | Pedir confirmación al usuario |
| Validar inputs de sus propias tools | Saltarse `executionMode` / confirm del Hub |

Arranque: el Hub hace spawn (`npm run hub`); también `npm run agent` para
el proceso aislado. stdout = MCP; logs en stderr. SIGINT/SIGTERM →
shutdown. El Agent no contiene lógica LLM ni de confirmación.

### Protocolos — dos procesos, no mezclar

| Enlace | Protocolo | Estado |
|--------|-----------|--------|
| Cliente ↔ Hub | WebSocket JSON (`packages/protocol`) | Implementado |
| Hub ↔ Agent | MCP stdio | Implementado (7B) |

`MCP ≠ Agent`: MCP es un **transporte/contrato**. Agent es el **proceso**
local. MCP no es autorización ni Permission System.

`packages/protocol` = clientes ↔ Hub. Canal distinto de Hub ↔ Agent.

### Red

Tailscale entre dispositivos en desarrollo. El Hub corre en la PC hoy;
portable a VPS cambiando URL.

## Separación de conceptos

| Concepto | Qué es | Qué no es |
|----------|--------|-----------|
| **Plugin** | Empaque/declaración de tools | Un proceso |
| **Agent** | Proceso local multiplataforma | Otro cerebro / otro AgentRuntime / un plugin |
| **MCP** | Transporte/interfaz entre Hub y Agent | El proceso Agent |
| **AgentTool** / **Tool** | Capacidad callable (`execute`) | Conoce Windows vs Linux por sí sola |
| **Confirmation** | Gate humano en el **Hub** | Permission System ni PolicyEngine |

```text
LLM
 → Hub AgentRuntime
 → executionMode
 → confirm si corresponde
 → RemoteAgentTool
 → MCP
 → Agent
 → Local AgentTool (p. ej. filesystem.read)
 → OS
 → resultado
 → Hub
 → LLM
```

## Frontera remota (Etapas 7 / 7A / 7B)

Una `AgentTool` en el Hub puede ser **local** o **remota**
(`createRemoteAgentTool`). `AgentRuntime` no conoce MCP.

```text
Hub (cerebro)
  AgentRuntime · memoria · confirmación · ToolRegistry
      AgentTool local | RemoteAgentTool
              ↓
        RemoteToolExecutor
              ↓
        McpRemoteExecutor
              ↓
        MCP stdio
              ↓
Agent (proceso)
  lifecycle (start → MCP → shutdown)
  agent.echo
  filesystem.read (local; automatic; MAX_FILE_READ_BYTES;
                    mismo resolveSafePath / filesystem.root que write/list)
  filesystem.write (local; confirm en Hub; MAX_FILE_WRITE_BYTES;
                    sin confirmación en Agent;
                    root local opcional vía AgentConfig / AGENT_FILESYSTEM_ROOT)
  filesystem.list (local; automatic; un nivel; resolveSafePath
                    expect directory: el root sí es listable)
  process.execute (local; confirm en Hub; spawn argv, shell:false;
                    cwd vía resolveSafePath / filesystem.root; sin env overlay)
              ↓
        [FUTURO] delete
```

**MCP = transporte Hub ↔ Agent.** Confirmación en el Hub **antes** de MCP.

Contrato JSON-safe: `RemoteToolRequest` / `RemoteToolResponse`.

`agent.echo`, `filesystem.read`, `filesystem.write`, `filesystem.list` y
`process.execute` no se registran en el Hub productivo (sí como
`RemoteAgentTool` en tests vía MCP). `process.execute` = `confirm` (Hub) +
spawn en el Agent.
`filesystem.read` y `filesystem.list` = `automatic`. `filesystem.write` =
`confirm` (Hub). El Agent no pide confirmación. Las tres tools usan
`resolveSafePath` y el mismo `filesystem.root` local. Read/write rechazan el
root como archivo; list permite listar el root (es un directorio). Con root:
relativos contra el root; absolutos solo si quedan dentro; traversal y
symlink que salen se rechazan (`path_outside_root` / `symlink_not_allowed`);
symlink hacia dentro puede usarse. `filesystem.list` no es recursivo y no
devuelve contenido de archivos. TOCTOU: entre `lstat`/`realpath` y
`readFile`/`writeFile`/`readdir`.

El Agent **no** contiene LLM, AgentRuntime del Hub, SQLite, WebSocket de
clientes ni confirmación.

Seguridad sin capa extra: `executionMode` en la tool; confirm en el Hub;
validación por tool en el Agent cuando existan caps. OS. Sin Permission
System, PolicyEngine ni sandbox global.

## Confirmación y seguridad

```text
LLM → tool_call → ToolRegistry → executionMode?
  automatic → execute (in-process o vía Agent)
  confirm   → confirm_* en Hub → solo si approved → execute (posible Agent)
```

| Capa | Responsabilidad |
|------|-----------------|
| **Hub** | Auth, confirmation (`executionMode`), binding, historial. No decide filesystem paths. |
| **Agent** | Validación técnica, `filesystem.root` local y ejecución (filesystem) |

## Monorepo

```text
/
├── hub/                 # cerebro (@mxideass/hub)
│   └── src/             # incluye src/agents/ = AgentRuntime (no es agent/)
├── agent/               # MCP + agent.echo + filesystem.read/write/list
├── mobile/
│   └── android/
├── packages/protocol/   # WS clientes ↔ Hub
├── docs/
├── db/
└── package.json         # scripts de conveniencia (--prefix)
                         # SIN workspaces: cada paquete tiene su node_modules
```

## Decisiones selladas (con fecha y razón)

- Hub en Node.js / TypeScript (ecosistema agentes/MCP) tras evaluar Spring Boot.
- Monorepo plano: `hub/`, `agent/`, `mobile/`, `packages/protocol/` — sin
  `apps/` hasta que la raíz pase de ~10 entradas.
- **Un solo Agent (`agent/`)** multiplataforma; no codebases
  `agent-windows` / `agent-linux` / `agent-macos` (2026-08-21). Los
  placeholders `agent-windows/` y `agent-linux/` se consolidaron primero en
  `node/` y luego se renombraron a `agent/` (2026-08-22).
- Android en un módulo bajo `mobile/android/`; extracción Gradle solo si
  wear/builds/fronteras lo exigen.
- Wear OS / iOS: backlog (ver roadmap).
- Buds: periférico sin código propio; invocación vía ROLE_ASSISTANT.
- Identidad: **MX Ideass · Personal Agent**; namespaces
  `mx.ideass.personal.agent.*` / `@mxideass/*`.
- Confirmación de tools (6C/6D): en el Hub; fail-closed; sin Permission System.
- Auditoría de frontera Hub ↔ MCP ↔ Agent (Etapa 7G, 2026-08-23): suite de
  regresión fail-closed (confirmación, MCP, registry, filesystem.root).
  TOCTOU residual documentado; sin Guardian ni PermissionManager.
- Hub ↔ Agent: MCP stdio + proceso Agent (Etapa 7B, 2026-08-22);
  `agent.echo` no está en el catálogo productivo del Hub.
- Agent `filesystem.read` (Etapa 8A / 7E, 2026-08-22): `automatic`. El Hub no
  lee archivos. Misma frontera `filesystem.root` que write (`resolveSafePath`).
- Agent `filesystem.list` (Etapa 7F, 2026-08-23): `automatic`. Un nivel;
  `resolveSafePath` con destino directorio (el root es listable). Sin
  confirmación. El Hub no lista el filesystem.
- Agent `filesystem.write` (Etapa 8B): `confirm` en el Hub antes de MCP.
  Hardening local en el Agent (input, `..` legado, tamaño, no escribir directorios).
- Agent local filesystem boundary (Etapa 7D, 2026-08-22): `filesystem.root`
  opcional en el proceso Agent. No es Permission System. Hub = confirmación;
  Agent = ejecución + containment. Sin root = legado sin contención.
  Con root: `path.relative` por segmentos; walk `lstat`/`realpath`;
  TOCTOU residual documentado. Windows/Linux/macOS vía `node:path`/`node:fs`.
- Diseño de `process.execute` (Etapa 8A, 2026-08-23) e implementación
  (Etapa 8B, 2026-08-23): tool en el Agent; `spawn(command, args, { shell: false })`;
  `executionMode: confirm` en el Hub; cwd con `resolveSafePath`/`filesystem.root`;
  timeout 1s–120s (default 30s); stdout/stderr 64 KiB con truncado;
  `exitCode !== 0` ⇒ `ok: true`. Timeout MCP **por llamada** =
  `timeoutMs + holgura` (default global 15s intacto). Sin env overlay,
  background, sandbox ni allowlist. `bash -c` sigue siendo posible: la
  barrera es la confirmación. Sin Guardian ni PermissionManager.
- Auditoría de seguridad Hub ↔ Agent (Etapa 8C, 2026-08-23): ver sección
  **Auditoría 8C**. No hay bypass de confirmación en el camino LLM→Hub.
  El Agent stdio se puede invocar a mano (propiedad del modelo local).
  Leftover `guardian/` no está cableado. TOCTOU, secretos en stdout y
  prompt injection quedan como riesgos conocidos.

## `process.execute` (Etapas 8A/8B)

Implementado en `agent/src/tools/process-execute.ts`. El Hub **no** lo
registra en producción. Confirmación en el Hub; spawn solo en el Agent.

Objetivo: ejecutar un **binario** en la máquina del Agent sin que el LLM
arme una línea de shell. La tool vive en el Agent; el Hub confirma.

### Nombre

Recomendado: **`process.execute`**.

| Nombre | Pros | Contras |
|--------|------|---------|
| `process.execute` | No implica shell; alineado a `AgentTool.execute`; argv | “process” puede confundirse con el proceso Agent |
| `process.run` | Coloquial | Menos preciso; OpenClaw usa `process` para jobs en background |
| `shell.execute` | Familiar | Empuja a `sh -c` / `cmd /c`; lo que queremos evitar |

No copiar el par OpenClaw `exec` (string de shell) + `process` (sesión
background). Aquí hay **una** tool sincrónica.

### Input (mínimo)

```json
{
  "command": "string",
  "args": ["string"]
}
```

Opcional v1:

```json
{
  "cwd": "string",
  "timeoutMs": "number"
}
```

**No en v1 (contrato de input):** `env`, `stdin`, `shell`, `pty`, `uid`,
background. `detached` no es un campo de la tool; en POSIX el Agent lo
usa internamente para el process group (Etapa 12B).

- `command`: ejecutable (nombre en `PATH` del proceso Agent, o path). No es
  una línea de shell. Vacío / no-string → error, 0 spawn.
- `args`: array de strings. Ausente ≡ `[]`. Cualquier no-string → error.
- El LLM pasa argv; el Agent hace `spawn(command, args, { shell: false })`.
  No hay escaping de shell. El modelo **sí puede** pedir `command: "bash"` y
  `args: ["-c", "…"]`; eso no es un bug del contrato — es el mismo poder
  que un binario. La mitigación v1 es **confirmación humana**, no un parser
  de argv.

### Output (cuando el proceso **sí** se lanzó)

`ToolResult.ok === true` y `content`:

```json
{
  "command": "git",
  "args": ["status"],
  "exitCode": 0,
  "signal": null,
  "timedOut": false,
  "stdout": "…",
  "stderr": "…",
  "stdoutTruncated": false,
  "stderrTruncated": false
}
```

`exitCode !== 0` **sigue siendo `ok: true`**: falló el programa, no la tool.
`timedOut: true` también puede ir en `ok: true` (se spawnó; se mató por
reloj) con `exitCode: null` y `signal` si aplica.

`ToolResult.ok === false` solo si **no** se llegó a spawn válido:
input inválido, cwd rechazado, `ENOENT` del ejecutable, timeout de
**transporte** MCP, Agent muerto antes de spawn.

### `executionMode`

**`confirm`**, idéntico a `filesystem.write`. Flujo:

LLM → Hub `confirm_request` (input congelado) → approve → MCP → Agent →
`spawn`. Reject / timeout / cancel / disconnect WS: **0 MCP, 0 procesos**.
El Agent no emite `confirm_request`.

### cwd

Reutilizar **`filesystem.root` cuando exista** (`resolveSafePath`, expect
directorio), igual que `filesystem.list`. No es política global del Hub.

| cwd | Con root | Sin root (legado) |
|-----|----------|-------------------|
| omitido | root | `process.cwd()` del Agent |
| relativo | vs root; `..` lexical fuera → fail | vs cwd del Agent; `..` → fail (legado) |
| absoluto | solo si queda **dentro** del root | permitido (legado, como paths absolutos de FS) |
| inexistente | fail-closed, 0 spawn | fail-closed, 0 spawn |
| archivo, no dir | fail | fail |
| symlink fuera del root | fail (`symlink_not_allowed`) | n/a |

### env (pospuesto)

**v1: no aceptar `env` del LLM.** El hijo hereda `process.env` del Agent.

Riesgos si se añadiera overlay después: `PATH` (hijack de binarios),
`LD_PRELOAD` / `LD_*`, `DYLD_*`, `NODE_OPTIONS`, `PYTHONPATH`, `HOME`/`USER`
engañosos, `SystemRoot` en Windows. OpenClaw **rechaza** `env.PATH` y
loaders en host; si un día hay overlay, bloquear esas claves. No es
PermissionManager: es invariante de spawn.

### timeout

Propuesta (constantes en implementación futura, no hardcodear ahora):

- default **30_000 ms**
- min **1_000 ms**
- max **120_000 ms** (v1 foreground; sin jobs)

Al expirar: intentar matar el pid spawnado (`SIGTERM` Unix; `kill` Windows),
gracia breve, luego `SIGKILL` / force. **No garantiza** nietos (ver árbol).
`timedOut: true`; no retry.

**Choque con MCP:** `createMcpRemoteExecutor` usa **15_000 ms** sin retry.
Un `timeoutMs` de proceso **mayor** que el timeout MCP deja el hijo vivo y
el Hub fail-closed. En implementación: para esta tool, timeout MCP =
`timeoutMs + holgura` (p. ej. 5 s), un solo `callTool`, sin cambiar el
envelope. No alargar el timeout global de echo/filesystem.

Confirmación sigue en 60 s (`CONFIRMATION_TIMEOUT_MS`); es **antes** de MCP.

### stdout / stderr

- Encoding UTF-8 (reemplazo de bytes inválidos, no crash).
- Tope propuesto: **64 KiB** por stream (no 100 MB).
- Al superar: dejar de acumular, flags `stdoutTruncated` / `stderrTruncated`.
- Sin PTY v1. Binarios: texto reemplazado, no blob.

### Códigos / señales / errores

| Evento | `ok` | Notas |
|--------|------|--------|
| exit 0 | true | |
| exit ≠ 0 | true | contenido con `exitCode` |
| señal (SIGTERM, etc.) | true | `exitCode: null`, `signal` |
| timeout del proceso | true | `timedOut: true` |
| `command` no encontrado | false | `code: command_not_found`, 0 spawn efectivo |
| cwd inválido | false | 0 spawn |
| input inválido | false | 0 spawn |
| MCP timeout / Agent muerto | false | `remote_tool_*`; fail-closed en Hub |

Windows: `signal` suele ser `null`; usar `timedOut` + `exitCode`.

### Windows / Linux / macOS

Node `child_process.spawn(..., { shell: false })` es el portable.

- **PATH / PATHEXT:** Node resuelve ejecutables; no reimplementar.
- **`.bat` / `.cmd`:** a menudo requieren `shell: true`. v1: **no** activar
  shell; si spawn falla, error. No `cmd.exe /c` automático.
- Señales: POSIX sí; Windows `process.kill` es distinto. Documentar, no
  ramificar política.
- No `platform/` adapters hasta que un test demuestre necesidad.

### Frontera Hub vs Agent

| Hub | Agent |
|-----|--------|
| ¿Hace falta confirm? (`executionMode`) | ¿Input bien tipado? |
| Congelar `command`/`args`/`cwd`/`timeoutMs` | ¿cwd dentro de `filesystem.root`? |
| 0 MCP si reject | `spawn` + captura + timeout + límites |
| Binding sesión/dispositivo | No confirma |

El Hub **no** valida paths de cwd ni PATHEXT. El Agent **no** autoriza.

### MCP

**Sin cambio de transporte.** Envelope actual: `requestId`, `context`,
`input`. El input de `process.execute` viaja en `input`. Misma
comprobación de `requestId`. Sin auth MCP nueva.

### Concurrencia

El runtime ya ejecuta tool_calls **en serie**. `process.execute` **bloquea
el turno** hasta exit/timeout/error. v1 **sin** background (no copiar
`yieldMs` / tool `process` de OpenClaw).

### Desconexión (fail-closed)

| Momento | Efecto |
|---------|--------|
| Reject / timeout confirm | 0 MCP, 0 spawn |
| MCP cae antes de respuesta | Hub `ok: false`; Agent debe matar el hijo si aún corre (pid tracked) |
| Agent crash | Hub fail-closed; huérfanos posibles (OS) — sin reaper v1 |
| stdout a medias | no éxito parcial inventado; error de transporte |

Sin retry. Un `requestId` = un spawn como máximo.

### Árbol de procesos (Etapa 12B)

POSIX: cada `process.execute` usa `detached: true` **sin** `unref()`, de
modo que el hijo es líder de su process group. Timeout y `shutdown` del
Agent envían SIGTERM y, tras 500 ms, SIGKILL a `kill(-pid)` de **ese**
grupo. No se envía señal al PGID del Agent ni a otros execute concurrentes.

Windows: Node no expone Job Objects sin addons nativos. Se mata el pid
raíz (`child.kill`). Los nietos pueden sobrevivir. **Limitación explícita**;
no hay `taskkill` wrapper ni ProcessManager.

Quien haga `setsid`/daemonize **sí** puede escapar del grupo (KNOWN).
Sin Job Object / cgroup / reaper de tercer proceso.

### Secretos y prompt injection

stdout/stderr vuelven al LLM **sin redactar**. Pueden llevar tokens,
`printenv`, o texto adversario (CLI, logs). Igual que `filesystem.read`.
No filtros v1. El operador ve `command`+`args` en `confirm_request`.

### Comparación OpenClaw (docs `tools/exec`, sandbox, background)

| | OpenClaw | Nosotros (diseño 8A) |
|--|----------|----------------------|
| Forma | `command` **string** (shell) | `command` + `args[]` (`spawn`) |
| Shell | `sh -lc` / `pwsh` | `shell: false` |
| Dónde corre | gateway / sandbox / node | solo Agent (ya es el “node”) |
| Approval | modos deny/allowlist/ask/auto/full + reviewer | solo `executionMode: confirm` |
| Background | tool `process`, `yieldMs` | no v1 |
| Timeout default | 1800 s | 30 s propuesto |
| env | merge; bloquea PATH/LD_* en host | no overlay v1 |
| Sandbox | off by default; Docker/etc. | no |
| Plugins | exec in-process en gateway si no hay sandbox | privilegiado **solo Agent** |

**Igual (idea):** confirmación humana antes de efectos; límites de tiempo;
no tratar deny de `write` como si el proceso fuera read-only.

**Diferente:** dos procesos Hub/Agent; argv no shell; sin host/sandbox/
node selector; sin allowlist/reviewer.

**No copiar:** string de shell; `exec`+`process` dual; sandbox Docker como
frontera; `timeoutSeconds: 0` (timeout infinito); plugins in-process con
RCE; policy engine `mode=full` sin confirm.

**Sí razonable, más tarde:** rechazar overlay de `PATH`/`LD_*`; tope de
salida; matar al timeout.

### Sobreingeniería

**No** hacen falta Guardian, daemon extra, broker, sandbox, PermissionManager,
PolicyEngine, segundo Agent ni worker. Confirm + Agent `spawn` + root de cwd
basta para v1. Allowlists de binarios = Permission System → fuera.

### Adoptar ahora (cuando se implemente, no en 8A)

1. Nombre `process.execute`, argv, `shell: false`.
2. `executionMode: confirm` en Hub; reject = 0 spawn.
3. cwd acotado por `filesystem.root` si existe.
4. Resultado de proceso en `ok: true` (incl. exit ≠ 0).
5. Límites stdout/stderr + `timedOut`.
6. Sin `env` LLM; sin background; sin MCP nuevo.

### Posponer

`env` overlay, stdin, PTY, `.bat` vía shell, redact,
jobs, allowlist de binarios, `filesystem.delete`, Guardian/sandbox.

## Auditoría 8C — frontera Hub ↔ MCP ↔ Agent (2026-08-23)

Auditoría tras filesystem.read/write/list, process.execute, confirmation y
MCP stdio. **No** se añadieron Guardian, PermissionManager, sandbox ni
allowlists. Solo se documentan hallazgos y se cubren con tests de
regresión las propiedades fail-closed.

### Modelo de confianza

El Agent **no** es frontera contra un usuario con control total de la
máquina. Protege frente a errores del Hub, input inválido, traversal
accidental y MCP malformado. **No** protege frente a root/admin local,
quien puede lanzar el Agent a mano, malware local o quien tenga el
stdin del proceso Agent.

### Caminos de ejecución (código real)

Únicos procesos del producto: **Hub** y **Agent**.

- Clientes → Hub: WebSocket (`hub/src/ws/index.ts`, protocolo v1).
- LLM → `AgentRuntime` → `executionMode` → confirmación (si `confirm`) →
  `RemoteAgentTool` → `McpRemoteExecutor` → MCP stdio → Agent `ToolRegistry`
  → OS (`fs` / `spawn`).
- Hub productivo (`hub/src/index.ts`) solo registra `calculator`.
- Agent (`createDefaultToolRegistry`) registra solo `createDefaultExtensions`
  (`echo`, `filesystem`, `process`, `math`, `system`, `diagnostics`, `customer`). El core no registra tools por nombre.
- Un MCP server: `createAgentMcpServer` (stdio). Un cliente MCP: Hub
  `connectAgentStdioClient` / tests in-memory.
- `spawn` de negocio: solo `agent/src/tools/process-execute.ts`
  (`shell: false`, `stdio: ['ignore','pipe','pipe']`).
- WS/HTTP: solo Hub. Agent no escucha red.

### Preguntas de aceptación

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿`process.execute` sin confirmación vía Hub/LLM? | **No.** `executionMode: confirm`; reject/timeout/cancel = 0 MCP, 0 spawn. |
| 2 | ¿`filesystem.write` sin confirmación vía Hub/LLM? | **No.** Igual: 0 MCP, 0 write. |
| 3 | ¿Llamar al Agent sin Hub? | **Sí, en local:** stdio. Quien lance `agent` y escriba MCP en stdin puede llamar tools **sin** confirmación del Hub. No hay socket/HTTP/WS en el Agent. Es propiedad del modelo stdio, no un bypass remoto. |
| 4 | ¿Un request MCP ejecuta otra tool? | **No.** `registerTool(name)` por cada entrada del registry; nombre desconocido falla. |
| 5 | ¿Un `confirmationId` aprueba otra operación? | **No.** Binding sesión/dispositivo/conversación; el cliente solo envía `confirmationId`+`approved`; input congelado en el pending. |
| 6 | ¿Ejecución doble? | **No.** Pending one-shot; segundo respond = false. |
| 7 | ¿Escape accidental por shell? | **No automático.** `shell: false`. `bash -c` explícito **sí** corre si el humano confirma (v1). |
| 8 | ¿`filesystem.write` escapa del root? | **No** por path léxico/symlink walk. **TOCTOU** local same-host sigue abierto. |
| 9 | Riesgos abiertos | Ver tabla siguiente. |
| 10 | ¿Hace falta un tercer proceso? | **No.** Hub+Agent basta. Un Guardian no está cableado y no cierra stdio local ni TOCTOU sin rediseño. |

### Hallazgos

**CRITICAL:** ninguno en el camino LLM → Hub → confirmación → MCP.

**HIGH:** ninguno como bypass remoto.

**MEDIUM — invocación local del Agent (KNOWN / modelo).**
- Descripción: MCP stdio no autentica; el padre del proceso controla stdin.
- Exploitability: local (misma máquina / mismo usuario).
- Impacto: write/execute sin UI de confirmación.
- Estado: aceptado en v1. No es bypass del Hub.
- Arquitectura futura: solo si se exige Agent como servicio expuesto.

**MEDIUM — leftover `guardian/` (histórico 8C).**
- En 8D el árbol `guardian/` se eliminó. **No existe Guardian.**
- No hay tercer proceso ni reemplazo.

**LOW — envelope MCP `input: unknown`.**
- La validación vive en cada tool, no en Zod MCP. Tools desconocidas no
  se registran. Aceptable.

### Riesgos conocidos (no corregidos en 8C)

| Id | Severidad | Notas |
|----|-----------|--------|
| TOCTOU path | KNOWN RISK | Carrera `resolveSafePath` → `writeFile`/`spawn` cwd. Same-host, no bypass Hub. |
| `bash -c` | KNOWN RISK | Argv no es sandbox; confirmación humana. |
| Árbol de procesos | KNOWN RISK | `kill(pid)` no mata nietos daemonizados. |
| Secretos en stdout | KNOWN RISK | `printenv` vuelve al LLM; sin redact v1. |
| Prompt injection | KNOWN RISK | `filesystem.read` y stdout de CLI pueden inyectar al modelo. |
| Herencia de env | KNOWN RISK | El hijo hereda `process.env` del Agent (sin overlay LLM). |

### Stdio

Logs del Agent → **stderr**. stdout → transporte MCP (SDK). El hijo de
`process.execute` no hereda stdout del Agent (`ignore`/`pipe`/`pipe`).

## Etapa 8D — consolidación Hub ↔ Agent

Arquitectura de producto (dos procesos):

```text
LLM (FakeLLM en tests)
 → Hub AgentRuntime
 → executionMode / confirmation (Hub, antes de MCP)
 → RemoteAgentTool
 → MCP stdio (único transporte Hub ↔ Agent)
 → Agent MCP server
 → AgentTool local
 → OS
 → ToolResult → Hub → LLM
```

| Pieza | Rol | No es |
|-------|-----|--------|
| **Hub** | Cerebro: LLM, AgentRuntime, confirmation, RemoteAgentTool, cliente MCP | OS / filesystem / spawn de negocio |
| **Agent** | Proceso local: MCP server, ToolRegistry, ejecución OS | LLM, AgentRuntime, confirm_request |
| **MCP** | Transporte Hub ↔ Agent (`tools/list`, `tools/call`) | Permission System, sandbox, confirmation |
| **Confirmación** | Hub, antes de `RemoteToolExecutor.execute` | Duplicada en el Agent |

**NO EXISTE GUARDIAN.** No hay tercer proceso, PermissionManager, PolicyEngine
ni sandbox. `AGENT_FILESYSTEM_ROOT` lo interpreta solo el Agent.

El Hub **descubre** nombres vía MCP `tools/list` y asigna `executionMode`:
`filesystem.read`/`list` = `automatic`; `filesystem.write` y
`process.execute` = `confirm`. No duplica la implementación de esas tools.

El catálogo productivo de `hub/src/index.ts` sigue siendo `calculator` (no
requiere Agent al arrancar el Hub). Los tests 8D cablean descubrimiento +
FakeLLM. Empaquetado Windows/Linux/macOS (Hub+Agent) queda fuera de 8D.

## Etapa 12A — auditoría de seguridad (sin mitigar)

Reauditoría del camino LLM → Hub → confirmation → MCP → Agent → OS.
Documento: `docs/research/security-audit-12a.md`. **Sin** Guardian,
PermissionManager, PolicyEngine, sandbox ni tercer proceso.

Hallazgo principal: invocación MCP stdio directa al Agent ejecuta
`filesystem.write` / `process.execute` **sin** confirmation. Es el modelo
stdio local (aceptado), no un bypass remoto del Hub. TOCTOU de paths,
huérfanos de `kill(pid)` (antes de 12B) y secretos en stdout/read quedan
documentados como KNOWN/ACCEPTED. Confirmation en el Hub sigue fail-closed.

## Etapa 12B — árbol de `process.execute`

POSIX: `detached` sin `unref`; SIGTERM/SIGKILL al grupo del spawn.
Windows: kill del pid raíz; **no** se afirma cobertura de Job Objects.
Tracking en `process.execute` + `abortActiveProcessExecutes` en
`shutdown`/`onclose`. Arquitectura: Hub → MCP stdio → Agent → OS.

## Etapa 13A — contrato de Agent Extension de cliente

`customer.demo` demuestra una personalización de cliente compilada en el
bundle del Agent. Identidad 11A: extensión `customer` → tool `customer.demo`
(el archivo se llama `customer-demo.ts`; **no** hay excepción de namespace
`customer-demo` → `customer.demo`).

El Hub **no** importa la implementación. `customer.demo` está en la
Tool Policy por defecto (`DEFAULT_TOOL_POLICY`); `customer.test` la anuncia
el Agent y el Hub la deniega hasta que la policy la autorice (Etapa 13B).

**Hub extensions** podrán ser dinámicas en una etapa futura. **Agent
extensions son estáticas** y van compiladas en el deployment. Agent
Extension no es sandbox, PermissionManager ni PolicyEngine.

### Modelo de deployment

El Hub es el mismo binario. Lo que cambia entre clientes es el bundle del
Agent (qué extensiones entran en `createDefaultExtensions()`):

```text
Cliente A: core + filesystem + process + customer (demo)
Cliente B: core + filesystem + process + otra extensión de cliente
```

Sin la extensión en el compile/registro, `customer.demo` no aparece en
`tools/list`. El Hub no la inventa ni tiene fallback in-process.

## Etapa 13B — Tool Policy del Hub

Las Agent Extensions declaran capacidades. MCP las descubre (`tools/list`).
El Hub aplica una **Tool Policy** propia (`hub/src/tools/policy.ts`):
qué names se registran como RemoteAgentTool y con qué `executionMode`.

```text
Agent = capacidades
Hub   = política
```

- Ausencia en la policy = **deny** (no se registra, el LLM no la ve, 0 MCP).
- No hay `default = automatic` para tools desconocidas.
- El `executionMode` legado del Agent se ignora.
- Una entrada de policy para una tool que el Agent no anunció aborta el
  attach (**fail-closed**); el Hub no llega a READY.
- Confirmation sigue en el Hub: `confirm` → approve → MCP; reject → 0 MCP.

Esto no es un sistema general de permisos ni un proceso extra. Es
configuración de tools del Hub, lista para venir después de un archivo de
cliente sin cambiar el discovery.

Habilitar una extensión nueva: bundle estático en el Agent + entrada en
Tool Policy. **No** hace falta tocar `discover.ts` ni importar
`agent/src/tools/*`.

## Etapa 13D.1 — Office Excel read (Agent Extension)

`office.excel.read` es una Agent Extension estática del proceso Agent.
Lee un rango A1 de un workbook local y devuelve JSON estructurado.
No hay `office.execute`, macros, VBA ni `process.execute` como puente.

El Hub solo la descubre por MCP `tools/list` y la autoriza en Tool Policy
como `automatic`. No importa COM ni Excel. Excel instalado es dependencia
del entorno Windows (`winax` + Excel.Application). Fuera de Windows la
tool responde `excel_not_available` (fail-closed, sin parser Open XML).

Containment: el mismo `resolveSafePath` / `filesystem.root` que el resto
del filesystem. Límites: 200 filas, 40 columnas, 64 KiB JSON.
(13D.2 serializa las lecturas COM en el Agent; ver más abajo.)

Excel ya abierto: GetObject y reutilizar el workbook si está en
Workbooks; no se hace Quit de una instancia ajena ni se matan procesos.
Un workbook que abre esta tool se cierra sin guardar.

Sigue habiendo solo Hub + Agent. Sin Guardian, PermissionManager ni
tercer proceso.

## Etapa 13D.2 — Hardening Excel COM

COM sigue siendo implementación del Agent. El Hub no conoce `winax` ni
`Excel.Application`. `office.excel.read` permanece `automatic`.

`winax` es addon nativo **external** (no se embebe en el CJS). Node lo
resuelve desde el script en ejecución (`process.argv[1]`) y `execPath`,
nunca desde `process.cwd()`. En el package, si existe
`agent/node_modules/winax`, se copia junto a `agent.cjs`.

Lifecycle: `ownsExcel === true` (CreateObject) → `Quit` en finally.
`ownsExcel === false` (GetObject) → no se cierra Excel ajeno. Un workbook
que abrimos nosotros se cierra sin guardar; uno ya abierto no.

Las operaciones COM (lectura y escritura) se serializan en el Agent (cola + `finally`). Shutdown
MCP/SIGINT espera la op activa (acotada a 15s, alineada al timeout MCP del
Hub) y rechaza nuevas. No hay retry. Linux/macOS: `excel_not_available`.

Límites A1 y `Rows.Count`/`Columns.Count` se aplican **antes** de leer
`Value2`. JSON > 64 KiB → `result_too_large`, sin truncar.

## Etapa 13E — Office Excel write (Agent Extension)

`office.excel.write` escribe un rango A1 rectangular en un workbook
**existente**. No crea archivos ni hojas. Policy del Hub: `confirm`
(reject/timeout/cancel = 0 MCP). Approve = 1 llamada MCP.

Si `workbook` falta, se usa el workbook activo de Excel. Si se indica,
se resuelve con `resolveSafePath` / `filesystem.root` y se reutiliza o
abre (read-write); no se hace `Workbooks.Add`. COM serializado con read.
`ownsExcel` / no-Quit de instancias ajenas: igual que 13D.2.

Linux/macOS: `excel_not_available`. Sin Guardian ni tercer proceso.

## Etapa 13F — Office contract hardening

Office es una Agent Extension privilegiada respecto al proceso Agent
(COM in-process). **No es sandbox.** El Hub no implementa Office.

Frontera:

| Plano | Responsabilidad |
|-------|-----------------|
| Hub | descubrimiento MCP, Tool Policy, confirmation |
| Agent | extensión `office`, COM, winax |
| OS | Excel |

Seguridad de Office:

1. Tool Policy (`office.excel.read` automatic, `office.excel.write` confirm).
2. Confirmation para mutaciones (reject/timeout/cancel = 0 MCP).
3. `filesystem.root` / `resolveSafePath` para elegir workbook (no hay segunda policy de FS).
4. Contrato cerrado de inputs (A1 vía `excel-a1.ts`, values tipados, sin fórmulas).
5. Lifecycle COM (`ownsExcel`, no-Quit de Excel ajeno, Close solo si lo abrió el Agent).
6. Un lock (`withExcelComLock`): una operación COM a la vez (read y write).
7. MCP fail-closed (policy inválida no llega a READY).

Timeout: el caller recibe `excel_timeout`; el lock se libera solo cuando
COM termina. No se mata el hilo COM. El timeout MCP de Office (20s) es
mayor que el timeout interno COM (15s), con holgura. filesystem/echo
siguen en 15s. Sin retry.

`workbook` omitido usa el workbook activo. UNC, `file://`, URLs y refs
externas se rechazan. Write no permite fórmulas; literales `-123` / `-12.5`
sí. Agent Extension ≠ sandbox.

## Doctrina
La estructura se gana con crecimiento real, nunca por anticipado. Se comparte
lo que al divergir rompería el sistema en silencio (protocolo, canal); lo
demás, cada app tiene el suyo. Paquetes por capacidad, jamás por tipo técnico.
