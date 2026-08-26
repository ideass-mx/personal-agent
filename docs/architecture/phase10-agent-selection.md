# PHASE 10 — Agent selection & Conversation context

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-24.

Auditoría de diseño. Sin código productivo, protocolo, SQLite, APIs, registries ni `agentId`.

Hoy la pregunta «¿qué Agent responde?» tiene una sola respuesta: el Agent implícito del proceso Gateway. No hay consumidor de múltiples Agents.

---

## 1. Executive summary

Cuando el usuario habla, el Gateway **no selecciona** un Agent. Compone **uno** al arrancar (`createDefaultAgentDefinition` + `createAgentRuntime`) y `ws.ts` envía **todos** los `user_message` a esa instancia.

`conversationId` elige el **hilo de mensajes**, no el actor. Session elige la **conexión** y el binding de confirmación. Workspace **no existe**. A2A **no existe**.

Seleccionar entre Agents es un problema de **composición/enrutado en el Gateway**, distinto de A2A (colaboración Agent→Agent) y de MCP (Agent→Tool).

**No** hace falta `agentId`, Workspace ni Router Agent para el producto actual. La identidad persistente solo se justifica cuando un cliente o una Conversation deban referirse a *otro* Agent que el default.

**Modelo recomendado (futuro, no código):** Gateway decide el Runtime instance (ligado a una `AgentDefinition`). Si hay continuidad, pegar esa decisión a la Conversation — no a la Session. Workspace, si existe después, es contexto de *trabajo*, no sinónimo de Agent.

---

## 2. Estado actual real

| Pieza | Hecho en código |
|-------|-----------------|
| Agent | Una `AgentDefinition` en memoria (`index.ts`) |
| Runtime | Una instancia; `runTurn` cierra sobre esa definition |
| Tools | Un `ToolRegistry` filtrado por `toolPolicy` de esa definition |
| Conversation | SQLite `conversations` / `messages`; `conversationId` opcional en WS |
| Session | `ws_*` + `deviceId`; `replying`; waiter de confirmación |
| Node | Hijo MCP stdio; no razona |
| Protocolo | `auth`, `user_message`, `confirm_response`, `ping`. Sin Agent |
| Workspace | Frontera PHASE 5; sin persistencia |

`title` en `conversations` no se usa como selector. `device_id` en mensajes no es Agent.

---

## 3. Conversation lifecycle

```text
user_message (conversationId?)
        │
        ▼
TurnMemory.ensureConversation
        │  id existente → reutilizar fila
        │  omitido / desconocido → INSERT c_<uuid>
        ▼
addMessage user → getHistory (historyWindow) → LLM → addMessage assistant
```

- **Nace:** primer turno o id nuevo.
- **Vive:** filas SQLite; no hay delete ni fin.
- **Recupera:** el cliente reenvía `conversationId` de `assistant_done`.
- **Contexto asociado:** mensajes user/assistant, `device_id` opcional. Nada de Agent, Workspace ni Session.

Conversation **no** identifica al Agent. **No** puede cambiar de Agent: no hay segundo. Binding Agent = anticipación.

---

## 4. Session lifecycle

```text
WS connect → createSession (id ws_*)
auth (token, deviceId) → authenticated
user_message → runTurn (sessionId para confirmaciones)
disconnect → dropSession (cancela waiters)
```

**Conoce:** socket, auth, `deviceId`, un turno `replying`, waiter.

**Debería conocer:** transporte y binding de confirmación. Eso es todo.

**No debe:** dueño del Agent, de Conversation (más allá de pasar el id del mensaje), ni de Workspace.

Varias Sessions pueden compartir un `conversationId`. Pegar Agent a Session rompería el hilo entre dispositivos.

---

## 5. Agent lifecycle

Nace al boot (`createDefaultAgentDefinition`). Muere con el proceso. No hay start/stop, persistencia ni id.

Es **configuration-scoped**. Distinto de Conversation y de Session.

---

## 6. Runtime lifecycle

Nace `createAgentRuntime({ agent, memory, llm, tools })`. Una instancia de producción, vida = proceso.

La **implementación** es reutilizable: otra llamada con otra definition = otra instancia, mismo motor.

Opciones (no implementadas):

| | Encaje actual |
|--|----------------|
| Instancia ligada a una Definition | **Sí — es el código de hoy** |
| Un Runtime compartido, Agent por turno | Requeriría cambiar `runTurn`; innecesario ahora |
| Un Runtime *implementation* por tipo de Agent | Prohibido (PHASE 4–6) |

Mejor arquitectura actual: **Gateway elige instancia** (cada una con su Definition + tools). No un mega-Runtime que muta de Agent.

---

## 7. Workspace actual vs futuro

Hoy: no hay store, id ni protocolo.

| Pregunta | Respuesta de diseño (no código) |
|----------|----------------------------------|
| ¿Selector de Agent? | Puede *sugerir* un default; no *es* el Agent |
| ¿Un Agent por Workspace? | No obligatorio |
| ¿Varios Agents? | Sí, conceptualmente (libro: escritor + research) |
| ¿Conversation ∈ Workspace? | Opcional; chat trivial puede no tener Workspace (PHASE 5) |
| ¿Auto-detectar Workspace? | No (PHASE 5) |

Workspace ≠ Agent. Conversation ≠ Workspace.

---

## 8. Dependency graph

```text
Cliente WS
  └── Gateway attachGateway(runtime)
        └── runtime.runTurn({ conversationId, sessionId, text })
              ├── AgentDefinition (closure)
              ├── TurnMemory → Conversation
              ├── LLMProvider
              └── AgentRuntimeTools → MCP → Node → Tools
```

No hay arista Conversation→Agent ni Session→Agent.

---

## 9. Context graph

```text
Turno
 ├── texto del usuario
 ├── Conversation (historial N)
 ├── AgentDefinition.prompt / model
 ├── Tools del catálogo (policy del Agent del proceso)
 └── Session (solo confirmaciones)
```

No hay Workspace, Agent peer, ni “tema” persistente más allá del texto + historial.

---

## 10. Responsibility matrix

| Pregunta | Hoy | Futuro plausible (Gateway) |
|----------|-----|----------------------------|
| ¿Qué Agent? | Boot de `index.ts` | Composición / política de producto |
| ¿Qué Conversation? | Cliente `conversationId` o nueva | Igual |
| ¿Qué Workspace? | N/A | Cliente o política; no automático |
| ¿Qué Tools? | Discover + policy del Agent único | Policy de *esa* Definition |
| ¿A2A? | N/A | Tras seleccionar Agents, si colaboran |

---

## 11. Candidate Agent-selection models

| Modelo | Idea | Pros | Contras hoy |
|--------|------|------|-------------|
| **A. Explícito** | Usuario elige Agent | Claro | Requiere protocolo/UX; no hay segundo Agent |
| **B. Por Conversation** | Hilo fija Agent | Encaja con `conversationId` existente | Schema/protocolo nuevos; vacío al crear hilo |
| **C. Por Workspace** | Trabajo fija default | Encaja “el libro” | Workspace no existe |
| **D. Por Gateway** | Mensaje → política del Gateway | Donde ya vive la composición | Hay que definir la política |
| **E. Router Agent** | Mensaje → Agent que enruta | Flexible | Es A2A + un Agent más; prematuro |
| **F. Combinación** | texto + Conversation + Workspace | Producto rico | Máxima anticipación |

Ninguno está implementado. **A2A no es el mecanismo de selección** (el usuario no es un Agent).

---

## 12. MCP vs A2A

```text
MCP:  Agent ──► MCP Server ──► Tool
A2A:  Agent ──► Agent          (no implementado)
```

Seleccionar qué Agent atiende al **humano** es Gateway (D/A/B).  
Si ese Agent pide ayuda a otro, eso sería A2A **después**.

Nunca: humano → MCP → Agent, ni Agent → MCP → Agent como sustituto de A2A.

---

## 13. Single Node

Sigue:

```text
Machine
├── Gateway (+ Runtime instance(s) futuras)
└── Local Node (MCP Server, Tools)
```

Varios Agents no exigen varios Nodes. El Node es ejecución, no personalidad. Un catálogo MCP puede servir a varios Agents (con policies distintas en el Gateway).

---

## 14. Future Distributed (no implementado)

Varios Nodes = más MCP Clients, no más Runtime implementations.  
Selección de **Agent** ≠ selección de **Node**.  
Sin NodeRegistry, discovery, heartbeat, `nodeId`.

---

## 15. Recommended model

**Ahora:** no seleccionar. Un Agent de proceso. Documentado.

**Cuando exista un segundo Agent de producto:**

1. Gateway crea N instancias `createAgentRuntime` (mismo código).
2. Punto de decisión: `attachGateway` / `reply` — «este turno usa la instancia X».
3. Continuidad: anclar X a **Conversation** (B) después de la primera elección, para no saltar de actor a mitad de hilo.
4. Primera elección: explícita (A) o default del Gateway (D). No Router Agent (E). No exigir Workspace (C) para arrancar.
5. Workspace, más tarde, puede ofrecer default; Conversations sin Workspace siguen válidas.

Pegar Agent a **Session** no se recomienda.

---

## 16. What NOT to implement yet

AgentRegistry, AgentSelector, AgentRouter, `agentId`, `nodeId`, campos WS, tablas SQLite, A2A, WorkspaceStore, segundo Runtime, Distributed, detección automática de Workspace/Agent.

---

## 17. Open questions

(Producto, no código ahora.)

- ¿Hay un segundo Agent con prompt/policy distintos que un usuario deba elegir?
- ¿El mismo `conversationId` puede cambiar de Agent a propósito?
- ¿Tools distintas por Agent o un catálogo MCP compartido?
- Relación futura Conversation–Workspace–Agent (cardinalidades).

---

## 18. Criteria for opening an implementation phase

Abrir implementación **solo si** se cumple al menos uno:

1. Hay un segundo `AgentDefinition` de producto (no un test).
2. Un cliente necesita nombrar o elegir ese Agent.
3. Una Conversation debe recordar qué Agent habló, y el default de proceso no basta.

Hasta entonces: **no identidad persistente “por si acaso”.**

---

## Casos naturales (sin implementar)

| Caso | Conversation | Workspace (futuro) | Agent (hoy) |
|------|----------------|--------------------|-------------|
| A. «Investiga NVIDIA.» | Nueva o actual | Podría nacer trabajo *research* | Default del proceso |
| B. «Escribe un resumen de lo investigado.» | **Misma** que A (historial) | Mismo trabajo si existiera | Mismo Agent salvo producto de roles |
| C. «¿Qué hora es?» | Puede ser hilo trivial **nuevo** | **No** crear Workspace | Default |
| D. «Regresemos al libro.» | Hilo del libro o uno nuevo ligado a él | Workspace *libro* | Default; no implica otro Agent |
| E. «Artículos sobre ausencia paterna.» | Como A | Research, no libro | Default |
| F. «Guarda esto para el libro.» | Hilo actual | *libro* (artifacts futuros) | Default; Tool/MCP, no A2A |

Falta para un router real: intención, Workspace, y/o elección explícita. Hoy solo hay texto + `conversationId`.

---

## Afirmación de cierre

PHASE 10 — AUDIT CLOSED / NO CODE CHANGE.

No hay consumidor real de selección. El Runtime ya admite varias Definitions por **instancia**. El hueco es composición del Gateway, no una nueva entidad.
