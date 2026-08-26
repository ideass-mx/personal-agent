# Auditoría arquitectónica: OpenClaw plugins/tools vs Agent Runtime

**Etapa:** 6 — investigación únicamente  
**Fecha:** 2026-08-21  
**Alcance:** análisis de la arquitectura actual de plugins/tools de OpenClaw como referencia; **sin implementación**.  
**Fuentes principales (oficiales):**

- [Plugin architecture](https://docs.openclaw.ai/plugins/architecture)
- [Plugin architecture internals](https://docs.openclaw.ai/plugins/architecture-internals)
- [Plugin manifest](https://docs.openclaw.ai/plugins/manifest)
- [Building plugins](https://docs.openclaw.ai/plugins/building-plugins)
- [Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins)
- [Plugins (install/config)](https://docs.openclaw.ai/tools/plugin)
- [Plugin dependency resolution](https://docs.openclaw.ai/plugins/dependency-resolution)
- [Tools overview](https://docs.openclaw.ai/tools)
- [Skills](https://docs.openclaw.ai/tools/skills)
- [Tool Search](https://docs.openclaw.ai/tools/tool-search)
- [Sandbox vs tool policy vs elevated](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)
- Licencia OpenClaw: MIT (`LICENSE` en [openclaw/openclaw](https://github.com/openclaw/openclaw))

**Contexto nuestro (código actual + docs de producto):**

- Runtime: `hub/src/agent/runtime.ts` — LLM → tool_call → `ToolRegistry` → `execute` → tool_result → LLM
- Tools: `AgentTool` + `ToolExecutionMode` (`automatic` | `confirm`) en `hub/src/tools/`
- Arquitectura de producto: `docs/architecture.md` — Hub + Agent vía MCP
- Protocolo: `packages/protocol/PROTOCOL.md` — reserva `confirm_*` y `agent_hello` (Fase 4)

---

## 1. Executive Summary

OpenClaw tiene un sistema de plugins maduro, **manifest-first**, con separación clara entre **metadata (control-plane)** y **código runtime (data-plane)**, ownership tipado de capabilities/tools, enable/disable, tools opcionales, factories contextuales, skills como instrucciones, y un marketplace (ClawHub). Su modelo de ejecución nativo es **in-process sin sandbox**: un plugin nativo es código con el mismo trust boundary que el Gateway.

Nuestro producto es distinto: agente **local-first**, Hub en la PC del usuario, acceso futuro a archivos/correo/credenciales/procesos, y una arquitectura donde **las garras viven en el Agent vía MCP**, no dentro del proceso del LLM.

**Veredicto:** debemos adoptar **ideas** de OpenClaw (manifest mínimo, metadata-only discovery, ownership, optional vs confirm, registry enriquecido), **simplificar** agresivamente el modelo de capabilities y el ciclo de vida, **posponer** skills/tool-search/factories/marketplace, y **evitar** convertirnos en un fork, copiar el manifest gigante, o tratar plugins de terceros in-process como arquitectura obligatoria para capacidades privilegiadas.

`ToolExecutionMode` en la tool **sigue siendo correcto** como autorización en el momento de ejecución. OpenClaw demuestra que hace falta una dimensión **complementaria** (disponibilidad / opt-in), no un Permission System centralizado que reemplace a la tool.

---

## 2. Arquitectura actual de OpenClaw

### 2.1 Cuatro capas

Según la documentación oficial, el sistema de plugins opera en cuatro capas:

1. **Discovery** — busca candidatos en paths configurados, workspace, roots globales y plugins bundled. Lee primero manifests (`openclaw.plugin.json` o layouts compatibles Agent Plugins / Codex / Claude / Cursor).
2. **Enablement** — decide enabled / disabled / blocked / slot exclusivo (p. ej. memory).
3. **Load + register** — plugins nativos se cargan **in-process** (`require` / Jiti de emergencia para TS local) y registran en un registry central. Bundles compatibles se normalizan a records **sin importar runtime**.
4. **Consume** — el resto de OpenClaw lee el registry para tools, channels, providers, hooks, HTTP, CLI, services, etc.

### 2.2 Capability model (público)

OpenClaw no trata “plugin = tool”. Un plugin registra **capabilities** tipadas: text inference, CLI backends, embeddings, speech, realtime, media, image/music/video generation, web fetch/search, channels, gateway discovery, etc. Además hay tools, hooks, commands y services.

Clasificación de “shape” por comportamiento real de registro: single-capability, multi-capability, hook-only, tools/commands/services-only.

**Implicación para nosotros:** ese modelo sirve a un gateway multi-canal / multi-proveedor. Nuestro `hub/` ya separa `providers/` del loop de tools; no necesitamos el catálogo completo de capabilities de OpenClaw para extender tools.

### 2.3 Ownership

Principio clave documentado:

- **Plugin** = frontera de ownership (compañía o feature)
- **Capability** = contrato del core que varios plugins implementan o consumen

Tools se declaran en manifest como `contracts.tools` y se registran en runtime con `api.registerTool(...)`. El registry rechaza ownership duplicado (mismo tool/provider id) con diagnostics.

### 2.4 Contratos de enforcement

Dos capas:

1. Validación al cargar (duplicados, registros malformados → diagnostics)
2. Contract tests de ownership en plugins bundled

### 2.5 Separación idea vs código reutilizable

| Tipo | Qué es | ¿Copiar código? |
|------|--------|-----------------|
| Idea arquitectónica | Manifest-first, snapshot metadata-only, registry unidireccional plugin→registry→core | No; reimplementar mínimo |
| Código OpenClaw | `PluginRegistry`, load pipeline, activation planner, ClawHub installer | No como dependencia; licencia MIT permitiría copiar fragmentos, pero el acoplamiento es enorme y no conviene |
| Dependencia | Empaquetar/forkear OpenClaw o su plugin-sdk | **Evitar** — no somos un OpenClaw host |

---

## 3. Plugin lifecycle

Pipeline de startup (docs internals):

1. Discover roots
2. Leer manifests + package metadata
3. Reject unsafe candidates (path escape, world-writable, ownership uid en no-bundled)
4. Normalizar config (`plugins.enabled`, allow/deny, entries, slots, load.paths)
5. Decidir enablement
6. Load módulos enabled
7. `register(api)` → `PluginRegistry`
8. Exponer registry al runtime

**Install/update** es un ciclo separado (CLI/Gateway): discover source → policy (`security.installPolicy`) → install a root gestionado → persist install record → enable → **restart Gateway** → inspect runtime.

Runtime **nunca** ejecuta `npm install` ni repara dependencias al arrancar (solo en install/update explícito).

**Para nosotros (futuro conceptual):** package → validate → register en índice persistido → enable → load bajo demanda → disable sin borrar config. Reinicio del API o hot-reload acotado; no inventar marketplace todavía.

---

## 4. Tool lifecycle

1. **Declaración estática** en manifest (`contracts.tools`, opcionalmente `toolMetadata`)
2. **Registro runtime** vía `api.registerTool` (objeto tool o factory)
3. **Filtrado por policy** (profile, allow/deny, sandbox, provider, plugin availability) **antes** de la llamada al modelo
4. **Exposición al LLM** solo de tools que sobrevivieron el filtro (o vía Tool Search diferido)
5. **Ejecución** con hooks `before_tool_call`, approvals (exec), sandbox/elevated según capa
6. **Resultado** tipado; opcional `outputSchema` para Code Mode / Tool Search

Optional tools: no se cargan/exponen hasta opt-in explícito (`tools.allow` incluye el tool o el plugin id). Factories pueden devolver `null` según contexto (sandbox, cuenta, etc.).

---

## 5. Manifest model

### 5.1 Qué hace OpenClaw

`openclaw.plugin.json` es metadata **antes de ejecutar código**:

- Identidad, `configSchema` (JSON Schema obligatorio aunque vacío)
- Ownership estático (`contracts.*`, `providers`, `channels`, …)
- Activation/setup hints
- Skills dirs, MCP servers estáticos, UI hints, dashboard, QA, doctor, etc.

El schema oficial es **muy grande** (decenas de campos de primer nivel). Un mínimo válido es solo `id` + `configSchema`.

### 5.2 Manifest mínimo recomendado para *nuestro* sistema (no implementar)

Campos que sí valen la pena eventualmente:

```json
{
  "id": "gmail",
  "name": "Gmail",
  "version": "1.0.0",
  "description": "Lectura y envío de correo Gmail",
  "tools": [
    { "name": "gmail.search", "optional": false },
    { "name": "gmail.send", "optional": true }
  ],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

| Campo | ¿Necesario? | Por qué |
|-------|-------------|---------|
| `id` | Sí | Clave estable enable/disable, ownership, install |
| `name` / `description` | Sí (UX) | UI, diagnóstico |
| `version` | Sí | Update, compat, auditoría |
| `tools[]` | Sí | Metadata-only discovery + ownership |
| `tools[].optional` | Sí (cuando existan plugins) | Disponibilidad ≠ confirmación |
| `configSchema` | Sí (aunque vacío) | Validar config sin cargar código |
| `skills` | No al inicio | Capa posterior |
| `providers` / `channels` / activation planner / dashboard / mcpServers / doctor / qa | No | Complejidad OpenClaw-gateway; no es nuestro producto |

**Clasificación:** Plugin manifest → **SIMPLIFICAR**

---

## 6. Registry model

### 6.1 OpenClaw

`PluginRegistry` central: records de plugin (identity, source, origin, status, diagnostics) + arrays por capability (tools, hooks, channels, providers, routes, CLI, services, …).

Flujo unidireccional:

- plugin module → registration
- core → consume registry

No mutación ad hoc de globals del core.

### 6.2 Nuestro `ToolRegistry` hoy

```text
Map<name, AgentTool>
register / get / list
rechazo de duplicados por nombre
```

`AgentTool`: `name`, `description`, `inputSchema`, `executionMode`, `execute`.  
Descriptor LLM: solo name/description/inputSchema (sin `executionMode`).

### 6.3 Qué valdría la pena *eventualmente* en el registry (no en `AgentTool`)

| Concepto | ¿Agregar? | Dónde | Razón |
|----------|-----------|-------|-------|
| `pluginId` / owner | Sí, más adelante | Record del registry | Ownership, disable por paquete, diagnóstico |
| `source` (bundled / local / installed) | Sí, más adelante | Record plugin | Trust y provenance |
| `version` | Sí, más adelante | Manifest / plugin record | Updates |
| `optional` / enabled / availability | Sí, más adelante | Tool registration metadata | Opt-in vs siempre visible |
| `diagnostics` | Útil | Plugin load | Fallos sin tumbar todo el API |
| `executionMode` | Ya existe | En `AgentTool` | Mantener |

**Clasificación:** Tool registry → **ADOPTAR** (evolución); Plugin registry → **SIMPLIFICAR** (índice + enablement, no el monstruo multi-capability).

---

## 7. Metadata vs runtime

OpenClaw construye un `PluginMetadataSnapshot` en startup:

- Índice instalado, manifest registry, diagnostics, owner maps, normalizer
- **No** contiene módulos cargados, SDKs, ni exports runtime

Útil para: validar config, UI/labels, auto-enable, ownership lookup, activation planning, doctor — **sin** importar el plugin.

### ¿Deberíamos poder conocer plugins/tools/versión/config sin cargar código?

**Sí, posteriormente.** Beneficios concretos en nuestro producto:

| Uso | Valor |
|-----|-------|
| UI | Listar “Gmail / Files / Shell” instalados, estado enabled, descripción |
| Instalación | Validar paquete y conflictos de nombres antes de activar |
| Configuración | Mostrar `configSchema` y errores sin ejecutar el plugin |
| Diagnóstico | “plugin X claims gmail.send but runtime missing” |
| Seguridad | Revisar ownership y superficie *antes* de dar trust de load |
| Descubrimiento de tools | Resolver qué plugin cargar cuando el modelo pide un tool |
| Performance | No importar todos los plugins al arrancar el API |

**Clasificación:** Metadata-only discovery → **ADOPTAR posteriormente**

---

## 8. Skills vs Tools vs Plugins

Definiciones OpenClaw (docs `/tools`):

| Concepto | Qué es |
|----------|--------|
| **Tool** | Función tipada callable por el modelo (`exec`, `browser`, …) |
| **Skill** | Pack `SKILL.md` (frontmatter + markdown) que **enseña** workflows/restricciones; no ejecuta por sí solo |
| **Plugin** | Paquete instalable con código/credenciales/lifecycle/manifest; puede aportar tools, skills, providers, channels, hooks, … |

Skills tienen precedence por roots, allowlists por agente, gating por binarios/env, e inyección de env/apiKey al host process (superficie de riesgo aparte).

### Recomendación para nuestro producto

Adoptar mentalmente la separación:

- **Tool** = capacidad ejecutable (`AgentTool`)
- **Plugin** = paquete que aporta tools (+ config + ownership)
- **Skill** = instrucciones/workflow sobre tools existentes

Skills **no** deben entrar al core ahora. Con pocas tools (`calculator` + futuras), el system prompt y descriptors bastan. Skills tienen sentido cuando haya workflows multi-tool estables (p. ej. “triage de correo”) y riesgo de ensuciar el prompt core.

**Clasificación:** Skills → **POSPONER**

---

## 9. Security model

### 9.1 OpenClaw (capas)

1. **Sandbox** — *dónde* corre (host vs backend sandbox)
2. **Tool policy** — *qué* tools existen/permiten (allow/deny; deny gana)
3. **Elevated** — escape hatch de `exec` fuera del sandbox
4. **Approvals** — p. ej. exec approvals / permission requests post-selección del modelo
5. **Optional tools** — opt-in de exposición
6. **Install policy** — comando local que puede bloquear install/update
7. **Path safety** en discovery (escape de root, world-writable, uid)

Documento oficial: native plugins **no están sandboxed**; plugin malicioso = ACE en el proceso Gateway.

### 9.2 Nuestro modelo actual

- Seguridad **no centralizada**
- Cada tool declara `executionMode`
- Runtime aún **no** implementa el flujo real de confirm (tests lo documentan como etapa posterior)
- Protocolo reserva `confirm_request` / `confirm_response`
- Arquitectura de producto: Agent local (lectura / reversible / destructivo + confirm en Hub)

### 9.3 ¿Sigue siendo correcto `executionMode` con plugins?

**Sí, como eje de autorización en ejecución**, con matices:

| Riesgo | Por qué `executionMode` solo no alcanza |
|--------|------------------------------------------|
| Plugin malicioso | Puede mentir `executionMode: automatic` y leer credenciales |
| Tool maliciosa | Confiar en la declaración del autor es insuficiente para terceros |
| Update de plugin | Un update puede cambiar comportamiento sin cambiar el nombre |
| Dependency maliciosa | Supply chain en `node_modules` del plugin |
| Path traversal / ACE | Código in-process tiene FS y process del usuario |
| Credential access | Mismo proceso que el API = acceso a env, DB, tokens |

Conclusión: mantener `executionMode` en la tool; **añadir** (más adelante) capas de **trust de origen** (bundled vs installed), **enable/disable**, **optional**, y para privilegios reales **ejecución en el Agent** (MCP). No diseñar Permission System ahora.

**Clasificación:** Plugin security (modelo OpenClaw completo) → **SIMPLIFICAR**; In-process como única frontera → **EVITAR**

---

## 10. Isolation model

### 10.1 Hecho OpenClaw

> Native OpenClaw plugins run **in-process** with the Gateway. They are not sandboxed.

Bundles compatibles son más seguros *por defecto* porque hoy se tratan sobre todo como metadata/content (skills).

### 10.2 Hecho nuestro producto

Ya decidido en `docs/architecture.md`:

- API = cerebro (hoy `hub/`)
- Agent = garras (MCP)
- Confirmación en el Hub (`executionMode`)
- Clientes ↔ Hub = WS propio; Hub ↔ Agent = MCP

Esto es **más sano** para un agente personal con acceso a Windows que el default in-process de OpenClaw.

### 10.3 Opciones y recomendación

| Opción | Descripción | Veredicto |
|--------|-------------|-----------|
| A | Todos los plugins dentro del API | Solo para tools **trusted + puro cómputo** |
| B | Todos como procesos separados | Correcto para privilegios; caro para calculator |
| C | Ambos modelos | Inevitable a medio plazo |
| **D** | Empezar in-process para bundled seguros; **diseñar contrato** para evolucionar a IPC/MCP | **Recomendado** |

**Recomendación D (detalle):**

1. **Built-in / first-party in-process** en `hub/`: calculator, transformaciones, tools sin FS/credenciales.
2. **Privileged (filesystem, shell, mail, browser, OAuth tokens):** proceso separado — idealmente el agente Windows ya previsto, vía MCP u otro IPC estable.
3. Contrato de tool estable (`name`, schema, `executionMode`, result) **independiente** del transporte (local call vs MCP).
4. Plugins de terceros: default **no** in-process en el API; exigir paquete firmado/trusted o ejecución aislada antes de permitir ACE en el cerebro.

**Clasificación:** In-process plugins → **EVITAR como arquitectura obligatoria**; contrato IPC-ready → **ADOPTAR** (diseño, no código ahora)

---

## 11. Comparación con nuestra arquitectura

| OpenClaw | Nuestro sistema | ¿Adoptar? | Razón |
|----------|-----------------|-----------|-------|
| Plugin manifest (`openclaw.plugin.json` rico) | No existe | **SIMPLIFICAR** | Identidad + tools + version + configSchema bastan |
| Plugin registry multi-capability | No existe | **SIMPLIFICAR** | Índice enable/disable + ownership; no channels/speech/… |
| Tool registry central | `ToolRegistry` simple | **ADOPTAR** (evolucionar) | Mantener Map; añadir metadata de registro más adelante |
| Capability model amplio | `providers/` + tools separados | **EVITAR** copiar | Ya tenemos providers; no mezclar en “plugin god-object” |
| Tool descriptors (name/desc/schema) | `toLLMToolDescriptor` | **ADOPTAR** (ya) | Separación descriptor vs execute es correcta |
| Metadata-only discovery | No | **ADOPTAR posteriormente** | UI, install, security, lazy load |
| Plugin loading in-process | Tools compilados en el API | **SIMPLIFICAR** + **EVITAR** como único modelo | Bundled OK; privilegiados → MCP/Windows |
| Plugin lifecycle discover→enable→load | Registro manual en código | **SIMPLIFICAR** | Ciclo corto cuando existan packages |
| Plugin configuration + configSchema | `config.ts` global | **ADOPTAR posteriormente** | Config por plugin, secrets fuera del prompt |
| Enable/disable + allow/deny lists | N/A | **ADOPTAR posteriormente** | Control de superficie sin Permission System |
| Optional tools | Solo `executionMode` | **ADOPTAR posteriormente** | Complementa confirm; no lo reemplaza |
| Factory tools | Tools estáticas | **POSPONER** | Hasta workspace/cuenta/contexto |
| Skills (`SKILL.md`) | Prompts en `agent/prompts.ts` | **POSPONER** | Capa después de tools reales |
| Tool discovery / Tool Search | Envía **todas** las tools al LLM | **POSPONER** | Necesario con catálogo grande/MCP |
| Plugin ownership (`contracts.tools`) | Ownership implícito por módulo | **ADOPTAR posteriormente** | Evitar colisiones gmail.send |
| Plugin validation | Tests unitarios tools | **ADOPTAR posteriormente** | Manifest + duplicados + schema |
| Dependency mgmt per-plugin npm roots | N/A | **POSPONER** / **SIMPLIFICAR** | Install explícito; nunca repair en runtime |
| Runtime isolation (sandbox Docker etc.) | Agent + MCP | **ADOPTAR** nuestra vía | Mejor que sandbox Docker de OpenClaw para desktop |
| Plugin security / install policy | Trust total del código del repo | **SIMPLIFICAR** | Trust tiers + isolation; no policy engine completo aún |
| Persistent installed plugin index | N/A | **ADOPTAR posteriormente** | Lista instalada + enabled en disco |
| ClawHub / marketplace | N/A | **EVITAR** (ahora) | Producto personal, no ecosistema público |
| Code Mode / Tool Search experimental | N/A | **EVITAR** / **POSPONER** | Complejidad alta, poco ROI temprano |

---

## 12. Ideas que debemos adoptar

1. **Manifest-first (mínimo)** — conocer plugins/tools sin ejecutar código.
2. **Registry unidireccional** — plugins registran; el runtime solo consume.
3. **Ownership de tool names** por `pluginId` (en el registry, no necesariamente en `AgentTool`).
4. **Optional tools** como disponibilidad/opt-in, **complementario** a `executionMode`.
5. **Enable/disable** de plugins con config preservada.
6. **Validación** de duplicados, manifest inválido, config vs schema.
7. **Separación descriptor LLM vs metadata de seguridad** (ya empezada).
8. **Install ≠ runtime load** — no instalar deps al arrancar el API.
9. **Contrato de tool estable** listo para ejecución local o remota (MCP).

---

## 13. Ideas que debemos simplificar

1. Manifest: de ~50 campos OpenClaw a ~6–8.
2. Capability model: tools (+ más adelante memory/router), no zoo de providers media/channels en el mismo sistema de plugins.
3. Activation planner / exclusive slots / preferOver: innecesario al inicio.
4. Hook systems tipados masivos: no.
5. Bundles multi-formato (Claude/Cursor/Codex compatibility): no.
6. Doctor/QA/dashboard contracts en el manifest: no.
7. Tool policy groups (`group:runtime`, …): prematuro; allowlist simple basta cuando haya opt-in.

---

## 14. Ideas que debemos evitar

1. **Forkear o depender de OpenClaw** como host de plugins.
2. **Copiar el plugin-sdk** y su superficie de registro.
3. **In-process third-party plugins** con acceso a FS/credenciales/shell.
4. **Permission System** centralizado que reemplace `executionMode` en esta etapa.
5. **Skills como “código de confianza”** sin revisión (OpenClaw mismo advierte tratar skills de terceros como untrusted).
6. **Marketplace público** antes de tener un runtime estable y un modelo de trust.
7. **Tool Search / Code Mode** mientras el catálogo quepa en el prompt.
8. **Auto-enable agresivo** por heurística de config (superficie de sorpresa de seguridad).
9. **Mutar `AgentTool` prematuramente** con pluginId/optional/factory — ensucia el contrato mínimo actual.

---

## 15. Propuesta de arquitectura futura para nuestro sistema

Visión en capas (conceptual; **no implementar en esta etapa**):

```text
┌─────────────────────────────────────────────────────────┐
│  Clientes (Android / futuros)  —  WS protocol           │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Agent API (local)                                      │
│  AgentRuntime  →  LLMProvider                           │
│       │                                                 │
│       ▼                                                 │
│  ToolRegistry (ejecución)                               │
│       │     ▲                                           │
│       │     │ descriptors filtrados                     │
│       │     │                                           │
│  PluginIndex (metadata-only: id, version, tools,        │
│               optional, enabled, configSchema)          │
│       │                                                 │
│       ├── built-in in-process tools (calculator, …)     │
│       └── remote tool adapters ──MCP/IPC──► Windows     │
└─────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Agent (proceso local)                                  │
│  Capabilities futuras: shell, files, system, …          │
│  Confirm destructivo en el Hub                          │
└─────────────────────────────────────────────────────────┘
```

Dimensiones de control (complementarias):

| Dimensión | Pregunta | Mecanismo nuestro |
|-----------|----------|-------------------|
| Install/trust | ¿Puede existir este código? | Origen bundled vs installed; validación |
| Enable | ¿Está activo el plugin? | Config enable/disable |
| Optional | ¿Se ofrece al modelo? | `optional` + allowlist usuario |
| Confirm | ¿Puede ejecutarse sin humano? | `executionMode` + protocolo `confirm_*` |
| Isolation | ¿Dónde corre? | In-process vs MCP/Windows |

---

## 16. Cambios que eventualmente habría que hacer

Orden sugerido (futuro; fuera de esta etapa):

1. Implementar flujo real de `executionMode: confirm` (protocolo ya reservado).
2. Enriquecer **registros** del `ToolRegistry` (metadata lateral) sin romper `AgentTool`.
3. Introducir **PluginIndex + manifest mínimo** para first-party packages.
4. Cablear tools privilegiadas al **agente Windows / MCP** (Fase 4 roadmap).
5. Optional + enable/disable cuando haya >1 plugin de usuario.
6. Persistencia de plugins instalados.
7. Factories cuando haya contexto (workspace, cuenta).
8. Skills cuando haya workflows repetibles.
9. ToolDiscovery cuando el prompt no aguante el catálogo.

---

## 17. Cambios que NO debemos hacer

1. Modificar contratos actuales de `AgentTool` / protocolo WS en esta etapa.
2. Crear `Plugin` interface, `PluginRegistry`, filesystem plugin, MCP, permissions o manifest **ahora**.
3. Refactorizar `providers/` dentro de un sistema de plugins OpenClaw-like.
4. Añadir dependencias npm de OpenClaw.
5. Centralizar seguridad quitando `executionMode` de la tool.
6. Exponer todas las futuras tools privilegiadas dentro del proceso del API “porque OpenClaw lo hace”.

---

## 18. Riesgos

| Riesgo | Severidad | Mitigación conceptual |
|--------|-----------|----------------------|
| Copiar complejidad OpenClaw y frenar el producto | Alta | Manifest mínimo; posponer skills/search |
| Plugins in-process = RCE en PC del usuario | Crítica | IPC/MCP para privilegios; trust tiers |
| Confiar ciegamente en `executionMode` de terceros | Alta | Optional + enable + isolation; review de updates |
| Colisiones de nombres de tools | Media | Ownership `pluginId` + reject duplicates |
| Drift manifest ↔ runtime | Media | Validar `tools[]` vs register |
| Supply chain en deps de plugins | Alta | Install explícito, pin versions, no scripts en install |
| Skills que inyectan secretos al host | Media | No adoptar skills.env temprano |
| Doble seguridad confusa (Agent vs executionMode vs optional) | Media | Documentar dimensiones; mapear destructivo→confirm |

---

## 19. Recomendación final

**No convertirnos en un OpenClaw.** Adoptar su lección estructural más valiosa: **control-plane (manifest/metadata) ≠ data-plane (execute)**, con ownership explícito y carga perezosa. Conservar nuestro diferencial: **cerebro en Hub + garras en Agent vía MCP**, y `ToolExecutionMode` como contrato de confirmación en la tool.

Siguiente etapa razonable (cuando se pida): diseño de **contrato mínimo de plugin first-party** (documento + shapes TypeScript de propuesta), sin loader real — alineado a Fase 4 del roadmap, no un marketplace.

---

## Clasificación final por concepto

| Concepto OpenClaw | Clasificación | Nota corta |
|-------------------|---------------|------------|
| Plugin manifest | **SIMPLIFICAR** | id, name, version, description, tools, configSchema |
| Plugin registry | **SIMPLIFICAR** | Índice + estado; no multi-capability zoo |
| Tool registry | **ADOPTAR** | Evolucionar el actual con metadata de registro |
| Capability model amplio | **EVITAR** | Fuera de scope de nuestro runtime de tools |
| Tool descriptors | **ADOPTAR** | Ya alineado |
| Metadata-only discovery | **ADOPTAR posteriormente** | Alto valor UI/seguridad/perf |
| Plugin loading | **SIMPLIFICAR** | Lazy; bundled vs remote |
| Plugin lifecycle | **SIMPLIFICAR** | discover→validate→enable→load |
| Plugin configuration | **ADOPTAR posteriormente** | configSchema por plugin |
| Plugin enable/disable | **ADOPTAR posteriormente** | Superficie de trust |
| Optional tools | **ADOPTAR posteriormente** | Complementa `executionMode` |
| Factory tools | **POSPONER** | Hasta contexto real (cuenta/workspace) |
| Skills | **POSPONER** | Tras tools/workflows reales |
| Tool discovery / Tool Search | **POSPONER** | Cuando el catálogo no quepa |
| Plugin ownership | **ADOPTAR posteriormente** | `pluginId` en registry records |
| Plugin validation | **ADOPTAR posteriormente** | Mínimo: schema + duplicates + drift |
| Dependency management | **POSPONER** / **SIMPLIFICAR** | Install-time only |
| Runtime isolation (Docker sandbox OpenClaw) | **EVITAR** como copia | Preferir MCP + Agent |
| In-process plugins obligatorios | **EVITAR** | Solo bundled no privilegiados |
| Plugin security / install policy completa | **SIMPLIFICAR** | Trust + isolation primero |
| Persistent plugin registry | **ADOPTAR posteriormente** | Install records en disco |
| Marketplace / ClawHub | **EVITAR** (ahora) | No es el producto |
| Code Mode | **EVITAR** / **POSPONER** | Experimental y pesado |
| Copiar código OpenClaw | **EVITAR** | Ideas sí; dependencia/fork no |
| Licencia MIT (si algún día se reutiliza un fragmento) | Permitido legalmente | Atribuir; preferir reimplementar mínimo |

---

## Anexo A — Optional tools vs `executionMode`

| | Optional (OpenClaw) | `executionMode` (nosotros) |
|--|---------------------|----------------------------|
| Pregunta | ¿El modelo *ve* la tool? | ¿La tool *corre* sin humano? |
| Momento | Antes del prompt / load | En el execute |
| Ejemplo | `shell.execute` no está en allow → invisible | `gmail.send` visible pero `confirm` |
| Relación | Complementario | Complementario |

Ejemplos futuros coherentes con ambos:

| Tool | Optional / disponibilidad | executionMode |
|------|---------------------------|---------------|
| `calculator` | siempre | `automatic` |
| `filesystem.search` | disponible si plugin files enabled | `automatic` |
| `filesystem.write` | optional / allowlist | `confirm` |
| `shell.execute` | highly restricted / optional | `confirm` |
| `gmail.send` | optional | `confirm` |

---

## Anexo B — Factory tools (cuándo sí)

OpenClaw: `factory(ctx) => tool | null` con contexto (sandbox, delivery, requester, workspace).

Nosotros probablemente los necesitaremos cuando:

- Filesystem acotado a un workspace del usuario
- Gmail ligado a una cuenta OAuth conectada
- Browser ligado a un perfil

Hasta entonces, tools estáticas + “no registrado si no hay config” en el bootstrap del API es suficiente.

---

## Anexo C — Reutilización de código concreto

Si en el futuro se considerara reutilizar algo de OpenClaw:

| Pieza | Archivo/área típica (upstream) | Licencia | ¿Copiar o solo idea? |
|-------|--------------------------------|----------|----------------------|
| Separación metadata snapshot | docs + `PluginMetadataSnapshot` | MIT | **Solo idea** |
| `contracts.tools` ownership | manifest schema | MIT | **Solo idea** |
| Optional + toolMetadata | building-plugins / manifest | MIT | **Solo idea** |
| Per-plugin npm install roots | dependency-resolution | MIT | **Solo idea** (si algún día hay install) |
| Tool Search / Code Mode | `tools/tool-search` | MIT | **No copiar** — demasiado acoplado |
| Plugin SDK register API | `openclaw/plugin-sdk/*` | MIT | **No depender** |

**Regla:** preferir reimplementar un contrato de 50 líneas al estilo de nuestro `AgentTool` antes que importar su SDK.

---

## Anexo D — Alineación con docs propios

- `docs/architecture.md`: Hub + Agent + MCP → dos procesos; aislamiento **D** es el Agent, no un tercer proceso.
- `docs/roadmap.md` Fase 4: Windows gateway MCP — momento natural para ownership/remote tools.
- `PROTOCOL.md`: `confirm_*` y `agent_hello` — encajan con confirm + plugins remotos; no requieren Permission System nuevo.

---

*Fin del entregable de Etapa 6. Sin implementación de plugins en esa etapa.*

**Addendum Etapa 10A–10C:** no copiamos el plugin host de OpenClaw. Las Agent
Extensions son código estático in-process **del Agent** (echo, filesystem,
process, math). MCP sigue siendo solo transporte. Marketplace, sandbox, Guardian
y carga remota quedan fuera. Una extensión no es un proceso nuevo. 10C añade
`math` sin un tercer proceso ni PermissionManager.
