# PHASE 17 — Active Workspace (audit)

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

Active Workspace **no se implementa**. No hay evidencia suficiente: no existe User, no hay preferencias persistentes, la API HTTP de Workspace no identifica dispositivo, y el Runtime no debe conocer Workspace.

La frase «agrega esto al proyecto en el que estamos trabajando» es un problema de **preferencia de aplicación en el Gateway** (y más adelante de UX), no de Session, ni de `user_message.workspaceId`, ni del Agent Runtime.

---

## Código auditado

| Superficie | Hecho |
|------------|--------|
| Session | `ws_*` in-memory. `deviceId` copiado del `auth`. Muere al disconnect. Sin Workspace. |
| Auth WS | Token compartido `HUB_TOKEN` + `deviceId` inventado por el cliente. No hay User. |
| Auth HTTP Workspace | Solo `Authorization: Bearer`. **Sin** `deviceId`. |
| `devices` | `id`, `name`, `first_seen_at`, `last_seen_at`. Last-seen. Sin preferencias. |
| Conversation | `workspace_id` nullable. Eso es **Conversation Workspace**, no Active Workspace. |
| Workspace HTTP | CRUD + asociar/desasociar/resolver. Operación explícita. |
| WS `user_message` | `conversationId` opcional. Sin `workspaceId`. |
| `ToolContext` | `conversationId` + `deviceId`. Envelope MCP. |
| Agent Runtime | Sin Workspace. |
| SQLite | Sin `users`, sin `active_workspace_id`, sin tabla de preferencias. |
| Android `AppPreferences` | `device_id`, `conversation_id`, config Hub/Gateway legacy, voz neuronal. **No** Workspace. `gateway_agent_id` es Gateway legacy, no `agentId` de plataforma. |

No existe mecanismo de preferencias usuario/dispositivo en el Gateway.

---

## Respuestas

### 1. ¿Qué entidad tiene identidad estable hoy?

Solo **`deviceId`** (cliente lo persiste; Gateway lo registra en `devices`) y **`conversationId`**. El token es secreto de instalación, no de persona. Session no es estable.

### 2. ¿`deviceId` es adecuado para Active Workspace?

Es identidad **técnica del cliente** (este teléfono, este terminal). No es una persona. Se puede reutilizar, clonar o mentir: el Gateway solo exige el token compartido. Sirve como gancho *interino* de preferencia por aparato, no como dueño conceptual del «proyecto en el que estamos».

### 3. ¿Hace falta User antes de implementar?

**Conceptualmente sí** para «la persona que trabaja». **No** se crea User en esta fase (ni para desbloquear Active Workspace). Sin cuentas, un Active Workspace global del Gateway mezclaría todos los clientes que comparten `HUB_TOKEN`.

### 4. ¿Quién posee Active Workspace?

| Candidato | Veredicto |
|-----------|-----------|
| Session | **No.** Muere al colgar; rompe voz/earbuds y «mañana». |
| Conversation | **No.** Eso ya es `workspace_id` del hilo. |
| Gateway (un único mutable) | **No.** Un proceso, muchos dispositivos. |
| Device | Posible *almacén interino*, no el dueño de producto. |
| User | **Dueño conceptual.** No existe en código. |

**Dueño conceptual:** preferencia de **User** (qué trabajo está «en foco»).  
**Hasta que exista User:** no implementar. No colgarlo en Session. No convertirlo en Conversation.

### 5. ¿Una persona, varios dispositivos?

Sí, ya ocurre: mismo `HUB_TOKEN`, distintos `deviceId` (Android vs terminal).

### 6. Device A → Workspace X, Device B → Workspace Y

Correcto si la preferencia es **por dispositivo**. Incorrecto si se asume una sola mente: el teléfono en el libro y el desktop en código deben poder divergir. Cuando exista User: un activo de persona **más** override opcional por dispositivo. Last-write-wins global es hostil.

### 7. Conversation `workspace_id = X` y Active = Y

El hilo **sigue en X**. Active Workspace **no pisa** una asociación persistida. Y no es un conflicto de datos: son capas distintas (hilo vs foco de UI/preferencia).

### 8. Precedencia (diseño; no código)

```text
1. Conversation.workspace_id no NULL  →  ese Workspace
2. Conversation.workspace_id NULL     →  null (casual)
3. Active Workspace                   →  preferencia aparte; no rellena (2) en cada mensaje
```

`resolveWorkspaceForConversation` permanece la verdad del **hilo**. Active Workspace no entra en esa función.

### 9. ¿Casual usa Active Workspace?

**No.** «¿Qué hora es?» permanece `workspace = null` aunque el dispositivo tenga un activo. Pegar casual al libro contamina historial y (futuro) knowledge.

Uso legítimo futuro del activo: UI («seguir en el libro»), **nueva** Conversation de trabajo creada *explícitamente*, voz «abre el libro». Nunca inferencia por texto en el mensaje.

### 10. ¿El Agent conoce el activo automáticamente?

**No en esta arquitectura.** El Runtime no recibe Workspace. MCP/Node tampoco. Si más adelante el Gateway hidrata material de un Workspace, es composición de aplicación **antes** del Runtime, con contrato nuevo y fase propia. Tools no ganan `workspaceId` hasta que exista un recurso de Workspace (Knowledge/Artifacts).

---

## Conversation Workspace vs Active Workspace

| | Conversation Workspace | Active Workspace |
|--|------------------------|------------------|
| Qué es | Relación persistida del hilo | Preferencia de foco (persona/dispositivo) |
| Dónde | `conversations.workspace_id` | No existe |
| Sobrevive Session | Sí | Debe sobrevivir (por eso no es Session) |
| Casual | NULL | Ignorado |
| Quién lo cambia | HTTP PATCH asociación | Futuro: preferencia explícita, no NLP |

## Lifecycle (futuro)

```text
set Active (explícito) → persiste fuera de Session
disconnect WS          → Session muere; Active no
reconnect              → mismo deviceId; Active intacto si estaba en Device/User
delete Workspace       → Active apuntando a él: invalidar (fail-closed), no inventar otro
casual turn            → no escribe Active; no lee Active para el hilo
associate Conversation → no copia Active salvo operación explícita
```

## Multi-device

Misma persona, varios `deviceId`. Activos pueden diferir. Una Conversation asociada a X se resuelve igual desde cualquier Session que envíe ese `conversationId`.

## Agent / Tools / MCP (futuro)

```text
Gateway
  ├── lee Conversation Workspace (ya posible)
  ├── (futuro) lee Active Workspace para UX, no para runTurn
  └── Agent Runtime → MCP → Node     sin Workspace
```

Active Workspace no es abstracción de ejecución.

## Por qué no implementar ahora

1. No hay User y no se crea uno «para esta fase».
2. `deviceId` no es persona; HTTP Workspace ni siquiera lo ve.
3. El consumidor HTTP ya hace operable Conversation → Workspace.
4. Meter Active en `devices` o en un global del Gateway fijaría el dueño equivocado.
5. El Runtime y el protocolo no deben cambiar para una preferencia de UI.

## Recomendación PHASE 18

No implementar Active Workspace todavía. Siguiente trabajo útil: **cliente** que use la API HTTP de PHASE 16 (listar/asociar hilos). Active Workspace solo después de una identidad de persona (o una decisión explícita «preferencia por `deviceId`» con UX multi-device documentada) y **sin** pasarlo a `runTurn`.
