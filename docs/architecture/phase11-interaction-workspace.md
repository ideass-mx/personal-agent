# PHASE 11 — Interaction & Workspace context

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-24.

Solo diseño. Sin protocolo, schema, store, Runtime, MCP, A2A ni multi-Agent.

---

## Diagnóstico actual (código)

| Superficie | Qué hay |
|------------|---------|
| Session | `hub/src/sessions/index.ts`: `id` (`ws_*`), `ws`, auth, `deviceId`, `replying`, waiter. Map in-memory. Muere al disconnect. |
| Conversation | SQLite `conversations(id, title, created_at)`, `messages(...)`. `ensureConversation` crea `c_*` si falta id. `getHistory` = últimos N (`historyWindow`). |
| Protocolo | `user_message.conversationId` opcional. Sin workspace, Agent, project, resource. |
| Runtime | `runTurn({ conversationId, sessionId, deviceId, text })`. Una `AgentDefinition`. |
| `ToolContext` | Envelope MCP: `conversationId` + `deviceId`. **No** es Workspace ni una entidad Context. |
| Workspace | No existe en `hub/src` ni en el protocolo. |
| Project / Resource | No son términos de plataforma en código. |

`title` de conversación no se usa como selector. `devices` es last-seen del cliente, no Workspace.

---

## Definiciones canónicas

| Término | Es | No es |
|---------|----|--------|
| **Session** | Conexión cliente↔Gateway (WS, desktop, Android, voz). `connect → active → disconnect`. | Conversation, Workspace, Agent |
| **Conversation** | Hilo: *qué se ha hablado*. Historial. **Sobrevive** a Session. | Session, Workspace |
| **Workspace** | *En qué trabajo estamos*. Persistente. | Conversación, sesión, carpeta, Agent, Project |
| **Agent** | Quién razona (`AgentDefinition`). | Runtime, Node, Workspace |
| **Agent Runtime** | Motor común. | Node, Gateway |
| **Node** | Ejecución; puede alojar **varios** MCP Servers. | Agent, MCP Server (el server es el proveedor de Tools) |
| **Gateway** | Entrada, sesiones, composición. | Runtime |

**Context:** no es entidad arquitectónica. Informal = lo que el turno ve (historial, prompt, tools). Usar Session / Conversation / Workspace / Agent / Tool / Node.

**Casual vs trabajo:** «¿qué hora es?» / chiste → Conversation sin Workspace. «Vamos a escribir un libro» → *podría* nacer un Workspace (futuro). **Nunca** Workspace automático por cada hilo.

---

## CURRENT vs FUTURE

### CURRENT

```text
Client
  └── Session (WS)
        └── user_message.conversationId?
              └── Agent Runtime (1 AgentDefinition)
                    ├── TurnMemory → Conversation SQLite
                    └── Tools → MCP → Local Node → MCP Server
```

No hay WorkspaceStore, `workspaceId`, AgentRegistry, NodeRegistry, A2A, Active Workspace.

### FUTURE (diseño; no código)

```text
Client
  └── Session                    (solo transporte)
        └── Conversation         (diálogo; opcionalmente ligada a un Workspace)
              └── Workspace?     (trabajo persistente)
                    ├── Conversations
                    ├── Documents / Research / Artifacts / Knowledge  (más tarde)
                    └── no es el Agent

Gateway
  ├── Sessions
  ├── Conversations
  ├── preferencia Active Workspace (usuario/dispositivo — no el socket)
  ├── Agent Runtime
  └── MCP → Node → Tools
```

Workspace **sobrevive** a Conversation y a Session.

---

## Modelo conceptual (futuro)

```text
Client → Session → Conversation ──(opcional)──► Workspace
Agent Runtime: Conversation + AgentDefinition + MCP Tools
```

Conversation → Workspace **no** existe en código.

---

## Active Workspace (solo diseño)

| Dónde | Ventaja | Desventaja |
|-------|---------|------------|
| **Session** | Simple en un WS | Muere al colgar; earbuds reconectan = se pierde; dos dispositivos desalineados |
| **Conversation** | El hilo no mezcla trabajos | Hilo nuevo («¿en qué nos quedamos?») no hereda; hay que resolver de nuevo |
| **Usuario / dispositivo (Gateway)** | Voz: continuidad sin «abre el workspace X»; sobrevive disconnect y «mañana» | Hay que persistir algo *cuando* exista store; no mezclar con Session |

**Justificación:** Active Workspace **no** es propiedad de Session (criterio 14). Encaje: **preferencia en Gateway por usuario o `deviceId`**, *más* un enlace opcional Conversation→Workspace cuando el hilo ya es de trabajo.

Al desconectar: Session muere; Active Workspace (si existiera) no. Al volver otro día: reanudar preferencia o pedir confirmación. Varios Workspaces: uno activo; el resto inactivo; Conversations casuales con Workspace **nulo**.

---

## Interacción natural (sin implementar)

Cadena tipo: hora → libro sobre mentiras → busca papers → guarda → título → mañana → «¿en qué nos quedamos?»

| Momento | Conversation | Workspace | Notas |
|---------|--------------|-----------|--------|
| «¿Qué hora es?» | Casual (nueva o actual) | **No** crear | Casual |
| «Pensando en escribir un libro…» | Puede seguir el mismo hilo | Candidato a Workspace *libro* | Intención persistente |
| Investigación / guardar / título | Mismo hilo de trabajo | Ese Workspace | Aislado de otros trabajos |
| «Mañana seguimos» | Hilo persiste en SQLite | Workspace persiste (futuro) | Session puede morir |
| «¿En qué nos quedamos ayer?» | Nueva Session; Conversation o resume | Active Workspace o confirmación | No asumir todo hilo nuevo = libro |

**Reanudación:** explícita / activo / inferencia futura / confirmar / fallback casual. Ninguna implementada. Inferencia automática **no** en esta fase.

---

## Voice / earbuds

```text
Usuario → earbuds → Gateway → Session (efímera)
                         → Conversation (si el cliente reenvía id o se reanuda)
                         → Active Workspace (preferencia, no el socket)
                         → Agent Runtime
```

No exigir «abre el workspace X» en cada frase. Continuidad = Conversation id **o** Active Workspace de usuario/dispositivo, no el `ws_*`.

Desktop / mobile / voz: mismo modelo. Session nunca dueña del trabajo.

---

## Multi-Workspace

Libro / producto / research / trading: varios por persona. Selección futura: UI, voz («el libro»), o activo. Cambio: actualiza preferencia + no reescribe historial ajeno. Aislamiento: historial y (futuro) knowledge **por Workspace**; Conversations casuales fuera.

Sin registry ahora.

---

## Agent ≠ Workspace

Workspace = trabajo. Agent = quién razona. Un Workspace puede usar el mismo Agent (hoy: el único). Varios Agents en un Workspace = PHASE 10, no ahora. No Project.

---

## Seguridad / aislamiento (frontera, no código)

Mezclar Workspace médico / libro / código privado es un fallo de **límite de contexto**, no de MCP. Futuro: el turno solo ve Conversation + material de *ese* Workspace. Tools/`filesystem.root` son del **Node**, no el Workspace. Sin controles nuevos en PHASE 11.

---

## Decisiones

1. Session ≠ Conversation ≠ Workspace ≠ Agent ≠ Runtime ≠ Node.
2. Node ≠ MCP Server (el Node hospeda servers).
3. MCP = Agent → Tool. A2A = Agent → Agent (no implementado; no es selección de Workspace).
4. Sin entidad Context.
5. Sin Workspace automático en chat casual.
6. Active Workspace ≠ campo de Session.
7. Sin store, `workspaceId` en WS, ni managers.

## Alternativas descartadas

- `ContextManager` / `WorkspaceService` / `ProjectStore` — sin consumidor.
- Active Workspace en Session — rompe voz y «mañana».
- Un Workspace por Conversation — contradice casual vs trabajo.
- Workspace = carpeta `filesystem.root` — eso es Node.

## Riesgos

Tratar `conversationId` como Workspace; pegar trabajo al WebSocket; auto-crear Workspace; filtrar knowledge entre trabajos cuando exista store.

---

## Implicaciones Voice

Session corta; Conversation y (futuro) Active Workspace largos. Cliente de voz debe poder reenviar `conversationId` **o** el Gateway reanudar preferencia de dispositivo — diseño, no protocolo nuevo ahora.

## Implicaciones multi-Workspace

El producto necesita *más adelante* identidad de Workspace y reglas de aislamiento. Hoy un solo Agent y un historial global por `conversationId` bastan. No schema.

---

## Criterios 1–16

Cubiertos arriba. Código actual no viola el diseño futuro: simplemente **no tiene** Workspace.
