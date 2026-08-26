# PHASE 20 — Continuidad Workspace (audit)

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Decisión: A) Active Workspace NO es necesario todavía.**

PHASE 19 ya cubre el consumidor real: asociar/desasociar el hilo visible. No hay User. Auto-asociar conversaciones nuevas (o hangs de voz) rompería el casual.

---

## 1. Identidad actual

| Identidad | Qué es | Persona? |
|-----------|--------|----------|
| `HUB_TOKEN` | Secreto de instalación. WS `auth` + HTTP Bearer. | No. Casa/máquina. |
| `deviceId` | String persistido en el cliente (`android-…`). Tabla `devices` = last-seen. | No. Aparato. Clonable. |
| Session WS `ws_*` | Conexión en memoria. Muere al disconnect. | No. |
| `sessionKey` (Android) | Hilo de UI / catálogo (`PersistedSessionProvider`). En Hub = `conversationId` de `user_message`. | No. |
| `conversationId` | Hilo SQLite. `ensureConversation` reutiliza el id enviado. | No. |
| Workspace `w_*` | Trabajo persistente. Relación: `Conversation.workspace_id`. | No. |
| OpenClaw `gateway_agent_id` | Backend externo. No es `agentId` de plataforma. | No. |

**No hay User. No hay autenticación por persona.** Varios dispositivos pueden compartir el mismo token. Un dispositivo no distingue quién lo usa.

OpenClaw: catálogo de sesiones y `agentId` OpenClaw; **sin** API Workspace equivalente.

---

## 2–4. Lifecycles

**Session WS:** connect → `auth` → `user_message` / voz → disconnect. Sin Workspace.

**Conversation:** sobrevive a Session y a la app. Al reabrir, Android reanuda `active_session_key` local y `GET …/workspace`. El Gateway no necesita el socket.

**Workspace:** CRUD HTTP. Asociación solo en Conversation. Borrar Workspace → SET NULL; mensajes quedan.

Continuidad Session → Conversation: el cliente reenvía `conversationId` / `sessionKey`. El Workspace viaja **con el hilo**, no con el WebSocket.

---

## 5. Casos de continuidad (código actual)

| Acción | Qué pasa | Active Workspace aportaría |
|--------|----------|----------------------------|
| Nueva Conversation (`SessionsViewModel.create` / hang de voz) | Nuevo `sessionKey`. Workspace **null** hasta PATCH explícito. | Auto-asociar: contaminaría casual y hangs. |
| Continuar Conversation | Mismo id. `workspace_id` persistido. UI recarga GET. | Nada. |
| Cambiar de Conversation | Coordinator `load(nuevo id)`. A y B independientes. Mismo Workspace en dos hilos: válido. | Nada. |
| Nuevo WebSocket, misma Conversation | Session nueva; hilo y Workspace iguales. | Nada. |
| Cerrar app | Catálogo local + SQLite Gateway. | Nada. |
| Casual «¿qué hora es?» | NULL. Selector «Sin Workspace». | Si se aplicara a cada mensaje, mezclaría el libro. |
| «Trabajar en un Workspace» | Usuario asocia (o «Crear y usar»). | Atajo de foco, no continuidad del hilo. |
| Inferir por texto | **No.** | **No.** |

El modelo evaluado es correcto **como diseño futuro**, no como hueco actual:

```text
Conversation.workspace_id  =  relación del hilo  (ya existe)
Active Workspace           =  foco para NUEVOS trabajos  (no hay consumidor)
```

Active **no** sobrescribe `workspace_id`. Casual puede seguir NULL. Nueva Conversation **hoy** nace NULL a propósito.

---

## 6. Multi-device

Device A / Conversation X / Workspace A y Device B / Conversation Y / Workspace B: **ya es posible**. Cada hilo tiene su FK. No hay preferencia global porque no hay User.

Una preferencia por persona exigiría cuentas. Por `deviceId` mezclaría todos los clientes que copien el id o compartirían mal el token. Last-write-wins en el Gateway (un solo activo por token) es hostil.

---

## 7. Voz / earbuds

`VoiceOrigin.InConversation`: sigue el `sessionKey` del chat → Conversation → Workspace persistido.  
`VoiceOrigin.AssistantInvocation`: `VoiceStreak` **crea** sesión nueva → Workspace NULL.

Earbuds: Session WS sube y baja; continuidad = Conversation (y su `workspace_id`), no Session, no deviceId como dueño del trabajo.

Meter Active Workspace en hangs crearía hilos de trabajo sin que el usuario lo pida.

---

## 8. Precedencia (si existiera Active; no implementado)

1. `Conversation.workspace_id` no NULL → ese Workspace.  
2. NULL → sin Workspace (casual).  
3. Active → solo default **explícito** al crear un hilo de trabajo nuevo; nunca en cada mensaje; nunca pisa (1) ni (2) en hilos existentes.

---

## 9. Decisión

**A) NO NECESARIO todavía.**

No es D: no hay User ni consumidor de «foco de persona».  
No es C: `deviceId` auto-asociaría chats y voz casual.  
No es B: no está *bloqueado*; **no hay producto que lo pida** ahora que PHASE 19 asocia el hilo a mano.

Condiciones para reconsiderar (fase futura, no 21 automático):

- Acción explícita «nueva conversación **en** este Workspace» (sigue sin ser Active global), o
- User real y UX de foco entre dispositivos, **sin** auto-bind de casual ni de hang.

---

## 10. Qué NO hacer

Active Workspace en Session, `user_message`, Runtime, ToolContext, MCP, Node.  
`activeWorkspaceId`. User/UserStore «para desbloquear». Inferencia NLP. Crear Workspace al nacer Conversation. Sobrescribir `workspace_id`. Managers/registries/Context entidades.

## PHASE 21 (recomendación)

No implementar Active Workspace. Siguiente trabajo útil, si hay producto: pulir Hub vs OpenClaw (selector solo Hub) o «crear conversación en Workspace» como **acción explícita** (PATCH al crear), no preferencia fantasma.
