# Terminología — Agent Platform

Fuente de nombres para docs y tests de arquitectura.
Contratos PHASE 3: [`phase3-contracts.md`](./phase3-contracts.md).  
Topología Agent/Node PHASE 4: [`phase4-agent-node.md`](./phase4-agent-node.md).  
Frontera Workspace PHASE 5: [`phase5-workspace.md`](./phase5-workspace.md).  
Agent Definition PHASE 6: [`phase6-agent-definition.md`](./phase6-agent-definition.md).  
Single Node PHASE 7: [`phase7-single-node.md`](./phase7-single-node.md).  
Config Agent/Node/Gateway PHASE 8: [`phase8-agent-node-configuration.md`](./phase8-agent-node-configuration.md).  
Selección de Agent PHASE 10: [`phase10-agent-selection.md`](./phase10-agent-selection.md).  
Interacción / Workspace PHASE 11: [`phase11-interaction-workspace.md`](./phase11-interaction-workspace.md).  
Persistencia Workspace PHASE 12: [`phase12-workspace-persistence.md`](./phase12-workspace-persistence.md).  
Asociación Conversation→Workspace PHASE 13: [`phase13-conversation-workspace.md`](./phase13-conversation-workspace.md).  
Resolución de Workspace PHASE 14: [`phase14-workspace-context.md`](./phase14-workspace-context.md).  
Audit ConversationContext PHASE 15: [`phase15-workspace-context.md`](./phase15-workspace-context.md) (no se introduce el tipo).  
API HTTP Workspace PHASE 16: [`phase16-workspace-http.md`](./phase16-workspace-http.md).  
Active Workspace PHASE 17: [`phase17-active-workspace.md`](./phase17-active-workspace.md) (audit; no implementado).  
Cliente HTTP Workspace PHASE 18: [`phase18-workspace-client.md`](./phase18-workspace-client.md).  
UI Workspace PHASE 19: [`phase19-workspace-ui.md`](./phase19-workspace-ui.md).  
Continuidad Workspace PHASE 20: [`phase20-workspace-continuity.md`](./phase20-workspace-continuity.md) (audit; Active Workspace no necesario todavía).  
Creación de Conversation en Workspace PHASE 21: [`phase21-conversation-creation-in-workspace.md`](./phase21-conversation-creation-in-workspace.md).  
Listado Conversation por Workspace PHASE 22: [`phase22-conversation-listing.md`](./phase22-conversation-listing.md).  
Lifecycle Workspace/Conversation PHASE 23: [`phase23-workspace-conversation-lifecycle.md`](./phase23-workspace-conversation-lifecycle.md) (audit; sin cambio de código).  
Arquitectura Tool / Capability PHASE 24: [`phase24-tool-capability-architecture.md`](./phase24-tool-capability-architecture.md) (audit; Tool suficiente; sin Capability).  
Topología Node / MCP PHASE 25: [`phase25-node-mcp-topology.md`](./phase25-node-mcp-topology.md) (audit; un Gateway + un Local Node + un MCP Server).  
Lifecycle / resiliencia Node PHASE 26: [`phase26-node-lifecycle-resilience.md`](./phase26-node-lifecycle-resilience.md) (audit; fail-closed; sin respawn).  
Readiness operativa PHASE 27: [`phase27-product-operational-readiness.md`](./phase27-product-operational-readiness.md) (audit; READY WITH DEBT; sin código productivo).  
HITL Android + env Node PHASE 28: [`phase28-hitl-and-node-boundary.md`](./phase28-hitl-and-node-boundary.md).  
Ejecución E2E de Tools PHASE 29: [`phase29-e2e-tool-execution.md`](./phase29-e2e-tool-execution.md) (audit; READY WITH DEBT).  
Continuidad Conversation PHASE 30: [`phase30-conversation-continuity-audit.md`](./phase30-conversation-continuity-audit.md) (audit; READY WITH DEBT; historial Hub no expuesto; transcript tools no en SQLite).  
Continuidad producto Conversation PHASE 31: [`phase31-conversation-product-continuity.md`](./phase31-conversation-product-continuity.md) (audit; READY WITH DEBT).  
Recuperación Hub + routing stream PHASE 32: [`phase32-conversation-recovery-and-stream-routing.md`](./phase32-conversation-recovery-and-stream-routing.md) (History API + `conversationId` en chunk/error).  
Seguridad / aislamiento producto PHASE 33: [`phase33-security-product-isolation-audit.md`](./phase33-security-product-isolation-audit.md) (audit; READY WITH DEBT; HUB_TOKEN = instalación; sin C/B).  
Completitud operacional producto PHASE 34: [`phase34-product-operational-completeness-audit.md`](./phase34-product-operational-completeness-audit.md) (audit; READY WITH DEBT; usable Single Node; sin instalador/health live).  
Salida de arquitectura / MVP PHASE 35: [`phase35-mvp-readiness-and-architecture-exit.md`](./phase35-mvp-readiness-and-architecture-exit.md) (audit; MVP-READY WITH DEBT; fin de auditorías arquitectónicas; siguiente trabajo = producto).
El código ejecutable aún usa nombres históricos (`hub/`, `agent/`, `AgentTool`).
No se introducen sinónimos extra ni abstracciones “por si acaso”.

## Términos oficiales

| Término | Significado |
|---------|-------------|
| **Agent** | Actor lógico. Hoy: una `AgentDefinition` en memoria (prompt, model, toolPolicy), sin `agentId` persistente. |
| **Agent Runtime** | Motor común. Código: `hub/src/agent/runtime.ts`. Recibe `AgentDefinition`. |
| **Tool** | Acción invocable por un Agent. Concepto canónico. |
| **Tool catalog** / **Tool set** | Conjunto de Tools disponibles en un momento dado. No es una clase ni un registry de plataforma. |
| **MCP** | Protocolo para descubrir e invocar Tools. |
| **MCP Server** | Proveedor de Tools. Hoy: una instancia in-process en el Local Node (`agent/src/mcp/server.ts`). No es entidad de dominio ni Agent. |
| **MCP Client** | Componente que permite al Agent Runtime descubrir e invocar Tools mediante MCP. |
| **MCP Adapter** | Capa del Gateway que conoce el SDK MCP y el transporte. Hoy: `mcp-stdio.ts` + `mcp-executor.ts`. El Runtime no la importa. |
| **A2A** | Mecanismo/protocolo para comunicación y colaboración entre Agents. **No implementado.** MCP no lo sustituye. |
| **Gateway** | Punto de entrada y coordinación: clientes, identidad, sesiones, routing, policy, lifecycle, confirmaciones y coordinación. Hoy: mayor parte de `hub/`. |
| **Workspace** | Contexto persistente de trabajo. CRUD HTTP; cliente `@mxideass/workspace-http` y selector Android (`conversationWorkspace`). **Active Workspace** no implementado. Sin `workspaceId` en WS. |
| **Conversation** | Hilo de diálogo. Puede tener `workspace_id` NULL (casual). Se puede crear por HTTP (`POST /conversations`) ya asociada o no. Listado por Workspace: `GET /workspaces/:id/conversations`. Sobrevive a Session y a la eliminación del Workspace (SET NULL). |
| **Context** | Uso informal del turno (historial, prompt, tools). **No** es entidad ni store. Preferir Session / Conversation / Workspace / Agent. |
| **Node** | Entorno de ejecución (máquina/dispositivo) que hospeda MCP Servers y Tools. Hoy: el proceso `agent/` es el **Local Node** implícito. |
| **Agent Platform** | El producto completo (repo, runtime, clientes). |

**Prohibido como concepto arquitectónico independiente:** Capability, CapabilityRegistry, CapabilityManager, CapabilityProvider, CapabilityCatalog, ToolLookup.

**Single Node** es una *topología* de despliegue (una máquina: Gateway + Agent Runtime + Local Node + MCP). Comando: `npm run hub` / `npm run dev`. Distributed es la misma arquitectura con varios Nodes; **no implementado**. Detalle: [`phase7-single-node.md`](./phase7-single-node.md).

## Código actual (nombres históricos, no el modelo de plataforma)

| En código | Cómo documentarlo |
|-----------|-------------------|
| `AgentDefinition` | Configuración lógica del Agent (`hub/src/agent/definition.ts`). No ejecuta. |
| `GatewayConfig` | Infraestructura del Gateway (`hub/src/config.ts`): puerto, token, SQLite, API key, maxTokens. |
| `NodeConfig` | Infraestructura del Local Node (`agent/src/config.ts`): `filesystem.root`. |
| `WorkspaceStore` | Puerto de persistencia de Workspace. Runtime no lo importa. |
| `SqliteWorkspaceStore` | Adapter SQLite. Compuesto en `index.ts` / `startServer`. |
| `ToolRegistry` | Registry interno **actual** (un `Map` por proceso). No es el registry global de la plataforma. |
| `RemoteAgentTool` | Adapter actual: `AgentTool.execute` que llama al MCP Adapter. En producción es el único camino. |
| `AgentRuntimeTools` | Puerto de invocación que el Runtime usa (get/list). Implementado por `ToolRegistry`. No es ToolLookup. |
| `ConfirmationPort` | Contrato del Agent Runtime: `wait(request)`. Sin transporte. |
| `ConfirmationWaiter` | Implementación del Gateway (`http/confirmation-waiter.ts`): pending, timeout, binding. |
| `LocalAgent` / `startLocalAgent` / `attachLocalAgent` | Lifecycle del **Local Node** / MCP Server. Nombre histórico; no es un Agent lógico. |
| `AgentConfig` (paquete `agent/`) | Config de infraestructura del Node (`filesystem.root`), no definición de Agent. |

El Agent Runtime **no** ejecuta Tools de negocio en su proceso. Descubre e invoca vía MCP (`RemoteAgentTool`). `AgentTool.execute` en el Runtime es el puerto interno; en producción siempre acaba en el MCP Adapter.

## Mapa físico actual (no rename)

| En disco | En arquitectura |
|----------|-----------------|
| `hub/` | Implementación actual del **Gateway**. Aloja el Agent Runtime y el MCP Client en el mismo proceso. Eso es aceptable. |
| `hub/src/agent/runtime.ts` | **Agent Runtime** |
| `agent/` | Precursor del **Local Node** + un **MCP Server** in-process. No es un Agent (no razona). |
| `packages/protocol/` | Contrato WS clientes ↔ Gateway (el documento del protocolo aún dice Hub) |

No hay carpeta `node/` a propósito. No hay `nodeId`, heartbeat ni fleet.

## Colisión de la palabra Gateway

| Nombre | Qué es |
|--------|--------|
| **Platform Gateway** | Componente de Agent Platform. Hoy: proceso/`hub/`. |
| **OpenClaw Gateway** | Backend **externo y opcional**. Cliente Android en `mobile/android/.../gateway/`. No fusionar. |
| **`attachGateway`** | Función en `hub/src/http/ws.ts`: transporte WebSocket. No es el componente Gateway. Deuda de nomenclatura. |

## Agent vs Agent Runtime

Todos los Agents usan el **mismo** Agent Runtime. La especialización viene de definición, instrucciones, configuración, Workspace, Tools disponibles, memoria/contexto y (futuro) A2A.

```text
Book Agent ──────┐
Research Agent ──┼──► Agent Runtime  (un solo motor)
Trading Agent ───┘
```

No hay `BookAgentRuntime`, `ResearchAgentRuntime` ni `TradingAgentRuntime`.

Un Agent **no** es un MCP Server. Un Agent puede consumir MCP, exponer MCP, o ambas cosas. No se asume que todo Agent sea MCP Server.

## Distinciones

| | |
|--|--|
| Agent ≠ Agent Runtime | El Runtime es el motor común; el Agent es el actor configurado. |
| Agent ≠ MCP Server | El Agent razona; el MCP Server provee Tools. |
| MCP ≠ A2A | MCP es Agent → Tool. A2A es Agent → Agent (no implementado). |
| Tool ≠ Capability | Tool es el concepto canónico. Capability está cancelado. |
| Node ≠ Agent | El Node es infraestructura; no razona. El proceso `agent/` es Local Node + MCP Server. |
| Workspace ≠ Session | Session es conexión/cliente; Workspace es trabajo persistente. |
| Workspace ≠ Conversation | Conversation es el diálogo humano. |

## Tool (canónico) — no Capability

Una Tool es una acción. Un MCP Server puede proporcionar muchas Tools. Un Agent puede consumir Tools de múltiples MCP Servers.

```text
                    Agent Runtime
                           │
                      MCP Adapter
                           │
                       MCP Client
                           │ MCP
                           v
                      MCP Server
                           │
                         Tools
```

A2A (no implementado):

```text
                    Agent
                      │ A2A
                      v
                    Agent
```

Ejemplos:

```text
MCP Server: email
    +-- email.search
    +-- email.read
    +-- email.send
    +-- email.reply

MCP Server: office
    +-- excel.read
    +-- excel.write

MCP Server: research
    +-- search
    +-- fetch
    +-- extract_references
```

Nombres públicos actuales (MCP / LLM) se conservan: `filesystem.read`, `office.excel.write`, `process.execute`.

No existe el concepto arquitectónico **local tool**. La implementación física puede ser mismo proceso, proceso separado, otra máquina, Docker, cloud u otro repo; para el Agent Runtime la frontera lógica es MCP Adapter → MCP Client → MCP Server → Tool. stdio es solo el transporte implementado hoy.

## MCP vs A2A

| | Dirección | Significado |
|---|-----------|-------------|
| **MCP** | Agent → Tool | Descubrir e invocar acciones. |
| **A2A** | Agent → Agent | Colaboración entre Agents. |

Ejemplo (diseño; A2A no implementado):

```text
Book Agent
    | A2A
    v
Research Agent
    | MCP
    v
Academic Research MCP Server
    +-- search_papers
    +-- get_paper
    +-- extract_references
```

MCP no es sustituto conceptual de A2A.

## Conversation / Workspace / Context

```text
Conversation
    |
    +-- conversación casual          (sin Workspace)
    |
    +-- conversación sobre un libro
             |
             +-- Workspace: Libro
                    +-- manuscrito
                    +-- investigación
                    +-- referencias
                    +-- documentos
                    +-- portada
```

Una Conversation puede existir sin Workspace. Un Workspace puede usarse desde múltiples Conversations. Context no es un contenedor persistente.

## Confirmación

```text
Agent Runtime
      │ ConfirmationPort.wait
      ▼
ConfirmationWaiter  (Gateway)
      │
      ▼
Client  (aprueba / rechaza)
```

**ConfirmationPort** = contrato del Agent Runtime. No conoce WebSocket, Hono ni `respond()`.

**ConfirmationWaiter** = implementación del Gateway. Pending in-memory, timeout 60s, binding de sesión/dispositivo.

**Client** = interfaz humana que aprueba o rechaza.

El Agent Runtime **no** conoce el transporte de confirmation. `sessionId` en `ConfirmationRequest` es identidad opaca del turno, no un objeto `Session` WS.

## Nombre del componente central

El centro de la plataforma se llama **Gateway**. No se documenta ni se nombra otro componente central.
