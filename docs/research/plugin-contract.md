# Contrato mínimo de plugin first-party

**Etapa:** 6B — diseño únicamente  
**Fecha:** 2026-08-21  
**Dependencia:** `docs/research/openclaw-plugin-audit.md` (Etapa 6)  
**Alcance:** definir el contrato conceptual para plugins first-party.  
**Fuera de alcance (no implementar aquí):** `PluginRegistry`, `PluginLoader`, manifest runtime, filesystem, MCP, IPC, cambios a `AgentRuntime` / `ToolRegistry`.

---

## Resumen ejecutivo

El contrato separa cuatro planos:

| Plano | Pregunta | Ejemplo |
|-------|----------|---------|
| **Identidad** | ¿Quién es el plugin? | `id`, `name`, `version`, `description` |
| **Capacidades** | ¿Qué tools aporta? | lista de tools con ownership |
| **Configuración** | ¿Qué necesita del usuario? | `configSchema` vs valores |
| **Runtime** | ¿Cómo se ejecuta? | in-process o IPC — opaco al `AgentRuntime` |

`AgentTool` permanece el contrato ejecutable mínimo. Ownership, optional, enabled y provenance viven **fuera** de `AgentTool` (en metadata / registro futuro).

`ToolExecutionMode` (`automatic` | `confirm`) se mantiene en la tool. No se introduce Permission System.

El `AgentRuntime` sigue hablando solo con `ToolRegistry` → tools con `execute(input, context) → ToolResult` JSON-serializable. Si más adelante la implementación es local o remota, el runtime no cambia.

---

## 1. Conceptos

### Plugin

Paquete first-party (y, más adelante, externo) que **aporta una o más tools** al agente, con identidad, metadata, configuración opcional y un punto de registro.

**Responsabilidades:**

- Declarar identidad y versión
- Declarar qué tools posee (ownership)
- Declarar esquema de configuración (si aplica)
- Registrar implementaciones de tools en el sistema
- Ejecutar la lógica de sus tools (local o detrás de IPC)

**No es responsabilidad del plugin:**

- Llamar al LLM
- Gestionar memoria conversacional
- Decidir el protocolo WebSocket
- Sustituir `ToolExecutionMode` por un Permission System

### Tool (`AgentTool`)

Capacidad ejecutable tipada que el modelo puede invocar.

Contrato actual (código):

- `name`, `description`, `inputSchema`
- `executionMode`: `automatic` | `confirm`
- `execute(input, context) → ToolResult`

**Responsabilidades:**

- Validar/interpretar su input
- Declarar si requiere confirmación humana
- Devolver resultado o error estructurado
- No filtrar secretos al descriptor LLM (eso lo hace el core vía `toLLMToolDescriptor`)

### ToolRegistry

Inventario en memoria de tools disponibles para el turn del agente.

**Hoy:** `Map<name, AgentTool>` con `register` / `get` / `list` y rechazo de duplicados.

**Responsabilidades:**

- Garantizar unicidad de `name` en el proceso del Hub
- Entregar tools al runtime / descriptors al LLM
- (Futuro) asociar metadata de ownership / availability sin ensuciar `AgentTool`

**No es:** un plugin marketplace, ni un Permission System, ni un loader de paquetes.

### Plugin metadata

Datos **baratos de inspeccionar** sin cargar código runtime: identidad, lista de tools, optional flags, `configSchema`, trust tier.

**Responsabilidades:** UI, validación, discovery, enable/disable, diagnóstico.

### Plugin configuration

Valores concretos del usuario/sistema para un plugin (`allowedRoots`, `accountId`, …), validados contra `configSchema`.

**Separado de:** secretos/OAuth (fuera de este contrato; no diseñar credential store aquí).

### Plugin runtime

Código o proceso que implementa `execute` de las tools del plugin.

Puede residir:

- En el mismo proceso del Hub (trusted first-party no privilegiado)
- Detrás de **Agent** (proceso local multiplataforma) vía transporte futuro
  (MCP y/o IPC) — ver `docs/architecture.md`

El runtime del **agente** (`AgentRuntime`) no debe importar detalles de transporte ni de OS.

**Agent ≠ Plugin:** Agent es el proceso OS local; un plugin es el
empaque de tools. Un plugin puede implementarse in-process o como adapter
remoto hacia Agent.

### Plugin ownership

Relación estable: `pluginId` posee un conjunto de `toolName`s.

Ejemplo: plugin `gmail` posee `gmail.search`, `gmail.read`, `gmail.send`.

Sirve para evitar colisiones, disable por paquete y diagnóstico (“quién registró esta tool”).

---

## 2. Plugin contract (propuesta)

### 2.1 Forma conceptual mínima

No es TypeScript ejecutable; es el shape objetivo:

```text
PluginIdentity {
  id: string              // estable, kebab-case, único en el sistema
  name: string            // legible
  version: string         // semver informativo
  description: string
}

PluginToolDeclaration {
  name: string            // único globalmente; preferir prefijo pluginId.
  description: string
  inputSchema: JsonSchema
  executionMode: "automatic" | "confirm"
  optional?: boolean      // default false — ver §7
}

PluginMetadata {
  ...PluginIdentity
  tools: PluginToolDeclaration[]   // ownership estático
  configSchema?: JsonSchema        // omitir o {} si no hay config
  trust?: "first-party" | "third-party"  // default first-party en esta fase
}

PluginRegistrationContext {
  // Lo que el sistema pasa al plugin al registrar (futuro)
  // config: valores ya validados contra configSchema
  // registerTool(tool: AgentTool): void  — o equivalente
}

Plugin {
  metadata: PluginMetadata   // o campos de identidad + declarations
  register(ctx: PluginRegistrationContext): void | Promise<void>
}
```

### 2.2 Qué es realmente necesario (first-party v1 conceptual)

| Campo | ¿Necesario? | Plano |
|-------|-------------|-------|
| `id` | Sí | Identidad |
| `name` | Sí | Identidad |
| `version` | Sí | Identidad |
| `description` | Sí | Identidad |
| `tools[]` (declaraciones) | Sí | Capacidades |
| `register(...)` | Sí | Runtime (punto de entrada) |
| `configSchema` | Solo si el plugin tiene config | Configuración |
| `optional` por tool | Posteriormente | Capacidades / availability |
| `enabled` | **No en el plugin** — lo decide el sistema | Sistema |
| `capabilities` tipo OpenClaw (speech, channels, …) | **No** | Evitar capability zoo |
| `skills` | **No** (pospuesto) | — |
| Factories | **No** (pospuesto) | — |

### 2.3 Separación de planos

```text
IDENTIDAD          id, name, version, description
CAPACIDADES        tools[] (name, description, inputSchema, executionMode, optional?)
CONFIGURACIÓN      configSchema  ≠  config values (sistema)
RUNTIME            register() + implementaciones execute (local o IPC)
```

**Regla:** `register` no inventa tools que no estén en metadata/declarations. Drift metadata↔runtime = error de validación (futuro).

### 2.4 Qué no es el contrato

- No es el SDK de OpenClaw
- No exige `api.registerProvider` / channels / hooks
- No incluye install desde npm/ClawHub
- No incluye Permission System

---

## 3. Tool ownership

### 3.1 ¿`pluginId` dentro de `AgentTool`?

| Enfoque | Ventajas | Desventajas |
|---------|----------|-------------|
| **A. `pluginId?:` en `AgentTool`** | Lookup trivial; viaja con la tool | Contamina el contrato ejecutable; tools core (“calculator”) forzan `undefined` o un pseudo-plugin; acopla descriptor LLM si alguien lo filtra mal |
| **B. Ownership fuera de `AgentTool` (recomendado)** | `AgentTool` sigue siendo puro; registry/index guarda `{ toolName → pluginId }`; IPC no necesita campo extra en cada execute | Requiere estructura lateral (PluginIndex / registration record) cuando existan plugins |

**Decisión:** ownership vive **fuera** de `AgentTool`.

Conceptualmente:

```text
ToolRegistrationRecord {
  pluginId: string | "core"
  tool: AgentTool          // sin pluginId obligatorio
  optional: boolean
  // enabled se evalúa a nivel plugin + allowlists del sistema
}
```

Core tools (`calculator`) usan `pluginId: "core"` o un registro sin plugin — detalle de implementación futura.

### 3.2 Convención de nombres

- Preferir **prefijo estable**: `gmail.search`, `filesystem.write`
- El nombre es el **id global** de la tool (clave del `ToolRegistry`)
- Dos plugins no pueden poseer el mismo `name` — fallo en validate/register
- Renombrar tool = breaking change de contrato (igual que cambiar schema)

### 3.3 Evitar conflictos

1. Declaración estática de ownership en metadata (`tools[].name`)
2. Validación: unión de names única entre plugins enabled
3. Registro runtime: `ToolRegistry` ya rechaza duplicados — segunda línea de defensa
4. Prefijos por `pluginId` como convención first-party (no hace falta namespacing automático en v1)

---

## 4. Plugin metadata

### 4.1 Mínimo

```json
{
  "id": "gmail",
  "name": "Gmail",
  "version": "1.0.0",
  "description": "Búsqueda y envío de correo Gmail",
  "tools": [
    {
      "name": "gmail.search",
      "description": "Busca mensajes",
      "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
      "executionMode": "automatic"
    },
    {
      "name": "gmail.send",
      "description": "Envía un mensaje",
      "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
      "executionMode": "confirm",
      "optional": true
    }
  ],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "accountId": { "type": "string" }
    }
  }
}
```

*(Ejemplo ilustrativo; no es un manifest implementado.)*

### 4.2 Qué pertenece al plugin vs al sistema

| Campo | Dueño | Notas |
|-------|-------|-------|
| `id`, `name`, `version`, `description` | Plugin | Identidad empaquetada |
| `tools[]` (+ `executionMode`, `optional`) | Plugin | Capacidades declaradas |
| `configSchema` | Plugin | Forma de la config |
| `enabled` | **Sistema** | Usuario/operador; no hardcodear en el paquete como verdad runtime |
| `config` values | **Sistema** | Persistidos fuera del código del plugin |
| Allowlists de optional | **Sistema** | Usuario opt-in |
| `trust` / isolation mode | **Sistema** (con hint del empaquetado) | First-party vs third-party |
| `capabilities` OpenClaw-like | **Ninguno** | No adoptar |

Metadata-only discovery (futuro): el sistema lee este bloque **sin** ejecutar `register`.

---

## 5. Configuration

### 5.1 Separación schema vs values

```text
Plugin (paquete)          Sistema (API / config del usuario)
─────────────────         ─────────────────────────────────
configSchema              plugins.entries.<id>.config = { ... }
                          validado contra configSchema
                          pasado a register/execute como datos JSON
```

Ejemplos de **schema** (no implementación):

| Plugin | Propiedades típicas (no secretos) |
|--------|-----------------------------------|
| `filesystem` | `allowedRoots: string[]` |
| `gmail` | `accountId: string` (referencia, no token) |
| `calendar` | `accountId: string` |

### 5.2 Reglas del contrato

- `configSchema` es JSON Schema serializable
- Valores de config son JSON-serializables
- **No** poner API keys ni refresh tokens en el contrato de plugin como campos “normales” documentados para el LLM
- Referencias (`accountId`) sí; materialización de secretos = capa futura de credential store (**fuera de esta etapa**)
- Plugin sin config: omitir `configSchema` o usar objeto vacío `additionalProperties: false`

### 5.3 PluginConfigSchema (nombre conceptual)

```text
PluginConfigSchema = JsonSchema   // mismo tipo que inputSchema de tools
PluginConfig = Record<string, JSON-serializable>
```

Validación (futuro): al enable/load, fallar cerrado si config no cumple schema.

---

## 6. Execution mode y plugins

Se mantiene el modelo actual:

```text
ToolExecutionMode = "automatic" | "confirm"
```

Vive en la **declaración/tool**, no en el Permission System.

Ejemplos coherentes:

| Tool | executionMode |
|------|---------------|
| `gmail.search` | `automatic` |
| `gmail.send` | `confirm` |
| `filesystem.read` | `automatic` |
| `filesystem.list` | `automatic` |
| `filesystem.write` | `confirm` |
| `calculator` | `automatic` |

### Convivencia con plugins

1. El plugin **declara** `executionMode` por tool en metadata y lo implementa en el `AgentTool` registrado.
2. El **AgentRuntime / Hub** aplica `confirm`: emite `confirm_request`, espera `confirm_response` (solo `confirmationId` + `approved`), timeout o cancelación por desconexión (fail-closed). La operación (`toolName`, `input`, `toolCallId`, `conversationId`) queda congelada en el pending del servidor y ligada a la sesión WS + `deviceId` (Etapa 6D). Ver `packages/protocol/PROTOCOL.md` y `hub/src/agent/confirmation.ts` (`CONFIRMATION_TIMEOUT_MS`).
3. Un plugin IPC/remoto debe **devolver o respetar** el mismo `executionMode` en su descriptor; el core puede re-validar contra metadata antes de exponer al LLM.
4. Plugins **no** pueden “escalar” saltándose confirm desde el lado del modelo: la confirmación es responsabilidad del **Hub/core** cuando `executionMode === "confirm"`.

No se añade `permission`, `role`, ni allow/deny matrix en este contrato.

---

## 7. `executionMode` vs `optional` vs `enabled`

| Concepto | Pregunta | Quién decide | Momento |
|----------|----------|--------------|---------|
| **executionMode** | ¿La acción corre sin humano? | Declaración de la tool | En `execute` / pre-execute |
| **enabled** | ¿El plugin (o la capacidad) está activo? | Sistema / usuario | Load / registro |
| **optional** | ¿La tool se ofrece al modelo solo bajo opt-in u otras condiciones? | Declaración + allowlist del sistema | Al construir descriptors para el LLM |

Ejemplo:

```text
plugin gmail: enabled=true
  gmail.search:  optional=false, executionMode=automatic  → visible, corre solo
  gmail.send:    optional=true,  executionMode=confirm    → invisible hasta opt-in;
                                                         → si visible, pide confirm
```

**Hoy:** `executionMode` está implementado de punta a punta (runtime + WS). `optional` y `enabled` siguen siendo **diseño documentado**, no implementar.

Complementarios; ninguno sustituye a los otros.

---

## 8. IPC-ready design (crítico)

### 8.1 Objetivo

```text
AgentRuntime
    → ToolRegistry
        → (tool).execute(input, context)
            → implementación local o remota
```

El runtime **no** conoce si la tool es in-process o IPC.

### 8.2 ¿Introducir `ToolExecutor` ahora?

| Opción | Pros | Contras |
|--------|------|---------|
| **A. Abstracción `ToolExecutor` en código ya** | Semántica explícita | Viola “no implementar”; over-engineering prematuro |
| **B. Diseñar `AgentTool` para evolucionar (recomendada)** | Cero cambios de código ahora; un adapter futuro puede envolver IPC detrás de `AgentTool.execute` | El nombre `AgentTool` sigue sugiriendo “objeto local” |

**Decisión de diseño:** **B**.

Patrón futuro sin tocar el loop del runtime:

```text
// Conceptual — no implementar
function createIpcAgentTool(decl, transport): AgentTool {
  return {
    name: decl.name,
    description: decl.description,
    inputSchema: decl.inputSchema,
    executionMode: decl.executionMode,
    async execute(input, context) {
      return transport.call(decl.name, input, serializeContext(context))
    },
  }
}
```

`LocalToolExecutor` / `IpcToolExecutor` pueden existir **detrás** de ese adapter; el `ToolRegistry` sigue guardando `AgentTool`.

### 8.3 Invariantes IPC-ready

1. Input / result / context wire-format = JSON (o JSON-compatible)
2. Sin closures, sin `Buffer` opacos, sin handles de Node en el contrato público
3. Timeouts / cancelación: futuro campo opcional en context (`signal` local no cruza IPC; se traduce a `abort`/`timeoutMs` serializable)
4. Errores siempre como `ToolResult` fail, no excepciones de transporte filtradas al LLM sin mapear

---

## 9. Serialización

### 9.1 Debe ser serializable (wire-safe)

| Pieza | Forma |
|-------|-------|
| Tool input | JSON (`unknown` JSON-compatible) |
| Tool result `content` | JSON-compatible |
| Tool result `error` | `{ code: string, message: string }` |
| Tool descriptor (LLM) | `{ name, description, inputSchema }` |
| Plugin metadata | JSON |
| Plugin config values | JSON |
| Context (wire) | subconjunto serializable — ver abajo |

### 9.2 `ToolContext` actual vs wire context

Hoy en código:

```text
ToolContext { conversationId: string; deviceId?: string }
```

Eso **ya es serializable**. Mantenerlo así es deliberado.

| Campo | ¿Wire? | Notas |
|-------|--------|-------|
| `conversationId` | Sí | Obligatorio |
| `deviceId` | Sí | Opcional |
| Logger / DB handles | No | Nunca en context público |
| `AbortSignal` | No en wire | Traducir a `timeoutMs` / `requestId` si hace falta |
| Credenciales | No | Resolver en el proceso del plugin vía accountId + store futuro |

**Contrato futuro conceptual:**

```text
ToolContextWire {
  conversationId: string
  deviceId?: string
  // requestId?: string
  // timeoutMs?: number
}
```

Un plugin remoto **solo** recibe `ToolContextWire` + `input` JSON. Nada de objetos Node arbitrarios.

### 9.3 Descriptor vs tool completa

- Al LLM: solo descriptor (ya: `toLLMToolDescriptor`)
- Entre procesos: descriptor + `executionMode` + ownership metadata pueden viajar en el control-plane; `execute` no viaja (es RPC)

---

## 10. Error model

Modelo actual:

```text
ToolResult =
  | { ok: true,  content: unknown }
  | { ok: false, error: { code: string, message: string } }
```

### ¿Suficiente para plugins?

**Sí, como contrato mínimo.** Razones:

- Cruza IPC sin ambigüedad
- El runtime ya mapea fail → tool_result con `isError`
- Códigos estables permiten UI/diagnóstico (`invalid_input`, `tool_not_found`, …)

### Extensiones posibles (no ahora)

| Extensión | ¿Cuándo? |
|-----------|----------|
| `error.details` JSON | Si hace falta machine-readable sin romper `message` |
| `error.retryable` | Cuando haya tools de red |
| Códigos reservados del core (`plugin_unavailable`, `confirm_required`, `timeout`) | Al cablear confirm + IPC |

**Regla:** plugins no lanzan excepciones no capturadas hacia el runtime como API pública; el adapter captura y convierte a `ToolResult` fail (el runtime actual ya tiene un try/catch de seguridad).

No modificar código en esta etapa.

---

## 11. Lifecycle (simplificado)

OpenClaw: discover → validate → enable → load → register → …  

**First-party v1 conceptual (mínimo real):**

```text
1. discover   — conocer plugins first-party (código en repo / índice estático)
2. validate   — metadata + unicidad de tool names + configSchema vs config
3. enable     — flag del sistema (default on para core/first-party elegidos)
4. register   — register() → ToolRegistry (solo enabled)
5. execute    — AgentRuntime vía ToolRegistry
6. disable    — quitar tools del registry / no re-registrar (config se conserva)
```

**Pospuesto / no necesario al inicio:**

| Paso | Motivo |
|------|--------|
| unload caliente sofisticado | Reiniciar API basta al principio |
| install/update/deps | No marketplace; first-party vive en el monorepo |
| activation planner | Catálogo pequeño |
| factories | Contexto dinámico aún no |

Orden mental: **validate antes de register**; **execute solo si registered**; **disable no borra config**.

---

## 12. Security boundary (sin Permission System)

### Trust tiers (conceptuales)

| Tier | Quién | Ejecución por defecto (diseño) |
|------|-------|--------------------------------|
| **Trusted first-party** | Código nuestro en el monorepo | In-process OK si **no** es privilegiado; privilegiado → preferir aislamiento (Windows/MCP) aunque sea first-party |
| **Isolated / untrusted** | Terceros o código no revisado | **Nunca** in-process en el Hub por defecto; solo tras aislamiento + enable explícito |

### Qué permite el contrato hoy (diseño)

- Mismo shape de Plugin/Tool para ambos tiers
- Campo/hint de trust en metadata o en el índice del sistema
- `executionMode` intacto
- Evolución a aislamiento **sin** cambiar `AgentRuntime`

### Qué no hace el contrato

- Sandbox Docker
- Allow/deny matrices estilo OpenClaw
- Un tercer proceso de aislamiento
- Firmar/verificar paquetes (futuro install)

Privilegio real (FS write, shell, mail send) = **confirm en el Hub +
ejecución en el Agent**, no un Permission System.

---

## 13. First-party vs third-party

| | First-party | Third-party |
|--|-------------|-------------|
| Contrato Plugin/Tool | **El mismo** | **El mismo** |
| Distribución | Monorepo / bundled | Futuro (no marketplace ahora) |
| Trust default | Trusted | Untrusted / isolated |
| In-process | Permitido si no privilegiado | No por defecto |
| Review | Nuestro proceso de código | Review + isolation obligatoria |
| `configSchema` | Igual | Igual |

**Decisión:** un solo contrato; la diferencia es **política de trust e isolation**, no dos APIs distintas.

Eso evita reescribir adapters cuando algún día existan plugins externos.

---

## 14. Comparación con OpenClaw

| Tema | OpenClaw | Nuestra propuesta |
|------|----------|-------------------|
| Ejecución | Plugins nativos **in-process** (sin sandbox) | Contrato **agnóstico**; in-process solo trusted no privilegiado; privilegiados → IPC/Windows |
| Manifest | `openclaw.plugin.json` muy rico | Metadata mínima (identidad + tools + configSchema) |
| Registry | `PluginRegistry` multi-capability | `ToolRegistry` actual + **PluginIndex** futuro (no zoo) |
| Ownership | `contracts.tools` + register | Declaraciones en metadata + records laterales; **no** `pluginId` en `AgentTool` |
| Optional tools | Sí (`optional` + allowlist) | Diseñado; implementar después |
| Enable/disable | `plugins.entries.*.enabled` | Sistema; no campo runtime del paquete |
| Config | `configSchema` + entries | Igual en espíritu; values fuera del paquete |
| Skills | `SKILL.md` | Pospuesto |
| Tool Search | Experimental | Pospuesto |
| Factories | Sí | Pospuesto |
| Capability model | Providers, channels, speech, … | **Evitar**; plugins aportan **tools** |
| Permissions | Policy + sandbox + elevated + approvals | Solo `executionMode` + confirm en Hub; validación por tool en Agent; sin Permission System |
| Marketplace | ClawHub | Evitar ahora |
| SDK | `openclaw/plugin-sdk/*` | No depender; contrato propio mínimo |

---

## 15. Propuesta final de arquitectura

```text
                         Clientes (WS protocol)
                                  │
                                  ▼
                            Hub
                                  │
                            AgentRuntime
                                  │
                            ToolRegistry
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
               Core Tools                  Plugins
              (pluginId=core)                   │
              p.ej. calculator           Plugin Contract
              AgentTool local                   │
                                       (metadata + register)
                                                │
                              ┌─────────────────┴─────────────────┐
                              │                                   │
                        In-process                     Remote adapter
                        (trusted,                      RemoteToolExecutor
                         no privilegiado)              → MCP spike (7A)
                              │                                   │
                              └──────────► AgentTool.execute ◄────┘
                                         (misma firma)
                                         input/context/result JSON-safe
```

### Flujo conceptual de registro (futuro)

```text
Plugin metadata (sin código)
    → validate (names, schema, drift rules)
    → si enabled: load runtime (local module | attach IPC agent)
    → register() produce AgentTool[] (wrappers si hace falta)
    → ToolRegistry.register(...)
    → AgentRuntime.list descriptors (filtrar optional/disabled)
```

### Flujo conceptual de execute (presente y futuro)

```text
LLM tool_call
  → ToolRegistry.get(name)
  → si executionMode=confirm: confirm_request → confirm_response (Hub; fail-closed)
  → tool.execute(JSON input, ToolContext)   // local O createRemoteAgentTool
        → RemoteToolExecutor.execute(RemoteToolRequest)
        → McpRemoteExecutor (spike 7A) | FakeRemoteExecutor (tests 7)
        → MCP stdio → Agent → agent.echo | filesystem.read | filesystem.write | filesystem.list
  → ToolResult JSON
  → tool_result → LLM
```

Confirmación **siempre** en el Hub, **antes** de `RemoteToolExecutor.execute()`
(y por tanto **antes** de MCP). Agent no pide confirmación.

**MCP ≠ autorización. MCP no decide `executionMode`.**
Solo transporta la invocación JSON-safe.

`packages/protocol` = WebSocket clientes ↔ Hub. Canal distinto de Hub ↔ Agent.

`agent.echo` (lifecycle), `filesystem.read` (`automatic`),
`filesystem.list` (`automatic`) y
`filesystem.write` (`confirm` en el Hub, **nunca** en el Agent) viven en el
Agent; no están en el catálogo productivo del Hub. MCP transporta; para
write, **después** de approve. El Hub no lee, escribe ni lista archivos.

**Hub** = autorización interactiva (`executionMode`). **Agent** = validación
y ejecución técnica. Confirmación ≠ “el Agent confía en cualquier path”.

`filesystem.root` (`AGENT_FILESYSTEM_ROOT` / `AgentConfig.filesystem.root`)
es configuración **local del Agent**. Lo usan `filesystem.read`,
`filesystem.write` y `filesystem.list` vía `resolveSafePath`. No es
Permission System.

- **Sin root:** legado — relativos vs cwd, absolutos aceptados, `'..'` se
  rechaza; sin contención de symlink.
- **Con root:** relativos vs root; absolutos solo hijos del root; el root
  no es archivo para read/write, sí es listable; `path.relative`; walk
  `lstat`/`realpath`. TOCTOU entre comprobación y `readFile`/`writeFile`/`readdir`.
  `filesystem.list` no recorre subdirectorios ni lee contenido.

**Hub** = cerebro. **Agent** = proceso local. **MCP** = transporte.
**Plugin ≠ proceso. Agent ≠ Plugin.**

### Compatibilidad con el código actual

| Pieza actual | Acción en esta etapa | Evolución |
|--------------|----------------------|-----------|
| `AgentTool` | **No modificar** | Suficiente como fachada IPC |
| `ToolRegistry` | **No modificar** | Más adelante: records con ownership |
| `ToolResult` / `ToolContext` | **No modificar** | Ya wire-friendly |
| `AgentRuntime` | **No modificar** | Sigue dependiendo solo del registry |
| `toLLMToolDescriptor` | **No modificar** | Sigue ocultando `executionMode` |

---

## Decisiones selladas (diseño 6B)

1. **Un contrato Plugin** con identidad + declarations + `register`; sin capability zoo.
2. **Ownership fuera de `AgentTool`.**
3. **`executionMode` se queda en la tool**; `optional` / `enabled` son dimensiones distintas y posteriores.
4. **`RemoteToolExecutor`** es la frontera; **`createMcpRemoteExecutor`** es el
   spike MCP. `AgentRuntime` no importa el SDK MCP.
5. **Todo lo que cruza proceso es JSON-safe**; context público = datos, no handles.
6. **`ToolResult` actual es suficiente** como error model mínimo.
7. **First-party y third-party comparten contrato**; difieren en trust/isolation.
8. **No Permission System, no OAuth, no credential store, no manifest runtime** en esta etapa.

---

## Fuera de alcance explícito / no hacer todavía

- Implementar `Plugin`, `PluginRegistry`, `PluginLoader`
- Archivos `*.plugin.json` en el repo como runtime
- Skills, factories, Tool Search, marketplace
- Permission System, filesystem.delete, shell, OAuth
- plugins / marketplace
- WebSocket Hub↔Agent; MCP discovery dinámico / servers instalables

El spike MCP (`agent/src/mcp` + `hub/src/tools/mcp-executor.ts`) **sí** está
en código; no está en el catálogo productivo del Hub.

**Hub** = cerebro. **Agent** = proceso local de ejecución. MCP los conecta.

---

## Siguiente etapa sugerida (cuando se pida)

`filesystem.delete` u otras garras. Sin Permission System.

---

## Etapa 8B — `process.execute` (implementado)

- **Nombre:** `process.execute` en el Agent. No está en el registry
  productivo del Hub.
- **Hub:** `executionMode: confirm`; 0 MCP si reject.
- **Agent:** `spawn(command, args, { shell: false })`; cwd con
  `resolveSafePath` si hay root.
- **Timeout MCP:** por `RemoteToolRequest.timeoutMs` (timeout de proceso +
  holgura). El default 15s de otras tools no cambia.
- **No v1:** `env` del modelo, stdin, PTY, background, allowlist, sandbox.
- **Riesgo:** `bash -c` no se bloquea; argv no es sandbox.

Detalle: `docs/architecture.md` (sección process.execute).

---

## Etapa 8C — auditoría de seguridad Hub ↔ Agent

Clasificación: ver `docs/architecture.md` (Auditoría 8C).

- **CRITICAL / HIGH:** no hay bypass de confirmación en LLM→Hub→MCP.
- **MEDIUM:** Agent stdio invocable a mano (modelo local). En 8D **no existe
  Guardian** (árbol eliminado).
- **KNOWN RISK:** TOCTOU, `bash -c`, secretos en stdout, prompt injection,
  process tree incompleto.
- **Arquitectura:** Hub + Agent sigue siendo suficiente. No se añade
  tercer proceso.

Tests: `hub/tests/security/audit-8c.test.ts`,
`agent/tests/security/audit-8c.test.ts`.

---

## Etapa 8D — consolidación runtime Hub ↔ Agent

- **Hub:** cerebro (LLM, AgentRuntime, confirmation, RemoteAgentTool, cliente MCP).
- **Agent:** proceso local (MCP server, ToolRegistry, OS).
- **MCP:** transporte; no es Permission System ni sandbox; no reemplaza confirmation.
- Confirmación solo en el Hub, antes de MCP.
- Descubrimiento: `tools/list` del Agent; el Hub no reimplementa filesystem.* ni process.execute.
- **NO EXISTE GUARDIAN.** El leftover `guardian/` se eliminó (si existía).
- Tests E2E FakeLLM: A–E + echo extensión (L) en `hub/tests/agent/e2e-8d.test.ts`.

### Etapa 10A — Agent Extension (implementado, mínimo)

Contrato runtime en el **proceso Agent**, no en el Hub:

| Campo | Uso |
|-------|-----|
| `name` | id de extensión (`echo`, `filesystem`, `process`) |
| `version?` | opcional |
| `tools` | `AgentTool[]` (vacío = no-op) |

### Etapa 10B — capacidades OS como extensions

`createDefaultExtensions(config)` compone:

| Extensión | Tools |
|-----------|--------|
| `echo` | `agent.echo` |
| `filesystem` | `filesystem.read`, `.list`, `.write` |
| `process` | `process.execute` |
| `math` (10C) | `math.add`, `math.subtract` |
| `system` (11B) | `system.info` |
| `diagnostics` (11C) | `diagnostics.ping` |
| `customer` (13A) | `customer.demo` |
| `customer` (13B) | `customer.test` (anunciada; Hub deny hasta policy) |
| `office` (13D.1 / 13E) | `office.excel.read` (automatic) y `office.excel.write` (confirm; Excel local Windows) |

### Etapa 10C — validación real de AgentExtension

`math` se añadió como extensión integrada **estática** (bundle). No hay
PluginManager, carga dinámica, marketplace ni permisos. El Hub solo
añade `executionMode: automatic` en discovery. El comportamiento de math
no vive en el Hub ni en AgentRuntime.

### Etapa 11A — contrato AgentExtension consolidado

Unidad estática de composición. Contrato: `{ name, version?, tools }`.
Sin PluginManager, permisos, sandbox ni carga dinámica.

Namespace de tools: `<extension>.<local>`. `local` puede anidar un
segmento extra (`excel.read` → `office.excel.read`). Excepción: `echo` →
`agent.echo`. Sigue prohibido registrar tools de otra extensión
(`filesystem.*` desde `office`).
Duplicados (extensión o tool) y tools fuera de namespace: fail-closed
(no se construye el registry; MCP no queda READY).

`executionMode` / confirmation siguen **solo en el Hub**.

Implementación de tools sigue en `agent/src/tools/` (utilidades compartidas: `safe-path`, tipos). Las factories de extensión inyectan `AgentConfig`. El core no hace `register()` de esas tools.

### Etapa 11B — extensión `system` (mecanismo real)

Una Agent Extension es código integrado estáticamente en el Agent que
aporta una o más AgentTools. Una extension NO implica permisos
adicionales, aislamiento, sandbox, proceso independiente ni acceso
privilegiado.

El Hub decide `executionMode`; la extension no puede decidir si una
operación requiere confirmación.

`system.info` entra por `createDefaultExtensions()` →
`registerExtension(systemExtension)` → ToolRegistry → MCP `tools/list`.
El Hub no importa `systemExtension` ni reimplementa la tool: solo mapea
`system.info` → `automatic` en discovery.

La defensa sigue siendo namespace + registry + `executionMode` del Hub.
Una extensión `system` no puede registrar `filesystem.write` ni
`process.execute`. No hay PluginManager, carga dinámica ni proceso extra.

Confirmation, MCP y Hub **no cambian**. OpenClaw puede extender el **gateway/cerebro** con plugins/nodos in-process.
Nosotros separamos:

| Concepto | Rol |
|----------|-----|
| Hub | cerebro / orquestación / confirmación |
| Agent | ejecución local |
| Agent Extension | capacidad ejecutable **dentro** del Agent |
| MCP | transporte Hub ↔ Agent |

No convertimos Extension → proceso, PermissionManager ni Guardian.
Plugin ≠ proceso Agent ≠ MCP ≠ Hub. No copiamos marketplace, sandbox,
Permission System ni carga remota de OpenClaw.

### Etapa 11C — independencia del mecanismo Agent Extension

`diagnostics.ping` es una extensión estática más. El Hub la descubre
solo con MCP `tools/list` y asigna `executionMode: automatic` en
`DEFAULT_TOOL_POLICY`. No importa `diagnosticsExtension` ni
`agent/src/tools/diagnostics`.

`AgentExtension` no incluye `executionMode`. El campo legado en
`AgentTool` lo ignora el Hub.

Si `diagnostics` no está en `createDefaultExtensions()`, no aparece en
`tools/list`. El Hub no aporta implementación alternativa.

Una extensión inválida impide construir el registry: MCP no queda READY
y el Hub no anuncia Agent READY (attach falla antes de `ready = true`).

### Etapa 12A — auditoría de seguridad

Revisión del camino LLM → Hub → confirmation → MCP → Agent → OS.
Documento: `docs/research/security-audit-12a.md`. Sin capas nuevas.
MCP stdio directo al Agent es modelo de confianza local (ACCEPTED), no
bypass remoto del Hub.

### Etapa 12B — process group

Timeout/shutdown/disconnect MCP intentan matar el grupo POSIX del
`process.execute`. Windows: limitación de pid raíz (sin Job Objects).
Sin ProcessManager ni tercer proceso.

### Etapa 13A — Agent Extension de cliente

`customer.demo` es una extensión estática de demostración. El Hub la
descubre solo con MCP `tools/list` y asigna `executionMode: automatic` en
`DEFAULT_TOOL_POLICY`. No importa `customerDemoExtension` ni
`agent/src/tools/customer-demo`.

Namespace 11A: identidad `customer` → `customer.demo`. El archivo
`customer-demo.ts` no introduce un mapeo con guion.

Si `customer` no está en `createDefaultExtensions()`, no aparece en
`tools/list`. El Hub no aporta implementación alternativa.

Hub extensions: dinámicas en el futuro. Agent extensions: estáticas en el
bundle. Distintos clientes = distintos bundles del Agent; el Hub no cambia.

### Etapa 13B — Tool Policy del Hub

Las Agent Extensions declaran capacidades. MCP `tools/list` las descubre.
El Hub aplica Tool Policy (`DEFAULT_TOOL_POLICY`): disponibilidad +
`executionMode`. Ausencia = deny. El Agent nunca decide confirmation.

`customer.test` se anuncia en el Agent y no está en la policy por defecto:
el Hub no la registra hasta añadir la entrada. `discover.ts` no conoce
implementaciones. Policy de tool no anunciada → attach fail-closed.

### Etapa 13D.1 — Office Excel read

`office.excel.read` vive en el Agent (`createOfficeExtension`). El Hub
solo la nombra en `DEFAULT_TOOL_POLICY` como `automatic`. Mecanismo:
Excel.Application COM vía `winax` (optional, Windows). Sin Excel:
`excel_not_available`. No hay `office.execute`, macros ni
`process.execute`. Paths: `resolveSafePath`. Bundle estático.

### Etapa 13D.2 — Hardening Excel COM

COM es del Agent. Hub: solo policy `automatic` + MCP. `winax` se resuelve
desde `argv[1]`/`execPath`, no desde cwd. Excel creado por el Agent
(`ownsExcel`) se cierra; Excel del usuario no. Ops COM en cola (una a la
vez). Shutdown limpia y no reintenta. Sin shell ni Open XML. Linux/macOS
siguen en `excel_not_available`. Sin tercer proceso.

### Etapa 13E — Office Excel write

`office.excel.write` vive en el Agent (`createOfficeExtension`). El Hub
solo la nombra en `DEFAULT_TOOL_POLICY` como `confirm`. Rechazo / timeout /
cancelación: 0 MCP y 0 COM. Approve: 1 MCP. COM reutiliza `winax-load`,
`excel-com-lock` y el lifecycle `ownsExcel`. No crea workbooks ni hojas.
`workbook` opcional (ActiveWorkbook). Sin shell, Open XML, Graph ni macros.
Linux/macOS: `excel_not_available`.

### Etapa 13F — Office contract hardening

Office es Agent Extension privilegiada (COM en el proceso Agent). El Hub
no implementa Excel. No es sandbox.

La seguridad depende de: Tool Policy, confirmation en write, filesystem.root
para workbook, contrato cerrado de inputs (`excel-a1.ts`), lifecycle COM,
lock de una operación, MCP fail-closed. Timeout MCP Office (20s) > timeout
COM (15s). Timeout no mata el hilo COM; el lock espera a que termine.

---

*Etapa 6B–7B. 8A/7E: filesystem.read + root. 8B: filesystem.write. 7D: filesystem.root local. 7F: filesystem.list. 7G: auditoría fail-closed Hub↔MCP↔Agent. 8A: diseño process.execute. 8B: implementación process.execute. 8C: auditoría de seguridad Hub↔Agent. 8D: consolidación Hub↔Agent. 9A/9B: lifecycle + package. 10A: Agent Extension mínima (`echo`). 10B: filesystem y process como extensions. 10C: extensión `math` (composición estática). 11A: consolidación de contrato y namespace. 11B: extensión `system` (`system.info`). 11C: independencia (`diagnostics.ping`). 12A: auditoría de seguridad Hub↔Agent. 12B: process group POSIX. 13A: Agent Extension de cliente (`customer.demo`). 13B: Tool Policy del Hub. 13D.1: `office.excel.read`. 13D.2: hardening Excel COM. 13E: `office.excel.write`. 13F: Office contract hardening.*
