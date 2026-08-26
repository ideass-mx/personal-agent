# PHASE 15 — Workspace context resolution (audit)

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

PHASE 14 ya entrega `resolveWorkspaceForConversation`. Esta fase decide si el Gateway necesita un objeto compuesto (`ConversationContext`) encima de esa función.

**Decisión:** no. El tipo no aporta un consumidor real. No se introduce.

---

## 1. Código auditado

| Superficie | Hallazgo |
|------------|----------|
| `conversation-workspace.ts` | `ConversationRecord` ya incluye `workspaceId: string \| null`. |
| `WorkspaceStore` / `types.ts` | Solo Workspace. No importa Conversation. |
| `resolve-workspace-for-conversation.ts` | `conversationId` → `Workspace \| null`. Fail-closed si la Conversation no existe o la FK está huérfana. |
| `index.ts` | Compone `createSqliteWorkspaceStore()` → `startServer({ workspaces })`. No pasa el store al Runtime. |
| `http/server.ts` | Conserva `workspaces` en el handle HTTP. `attachGateway` no lo recibe. |
| `http/ws.ts` | `runTurn({ conversationId, deviceId, sessionId, userMessage, confirmation })`. No resuelve Workspace. |
| `http/sessions.ts` | Sin Workspace. |
| `agent/runtime.ts` | `AgentTurnInput` / `runTurn` / deps sin Workspace. |
| `memory/types.ts` (`TurnMemory`) | Conversation id + historial. Sin `workspace_id`. |
| `tools/types.ts` (`ToolContext`) | `conversationId` + `deviceId`. Envelope de Tools/MCP, **no** es Workspace ni Context entidad. |
| Protocolo WS | `conversationId` opcional. Sin `workspaceId`. |
| MCP / `agent/` (Node) | Sin Workspace. `workspace` en tests de filesystem es un nombre de carpeta, no la entidad. |

Ninguna operación existente exige `workspaceId` en el protocolo. `user_message.conversationId` sigue siendo suficiente para resolver en el Gateway **cuando** un consumidor lo pida.

## 2. ¿ConversationContext?

Hipótesis evaluada:

```text
ConversationContext {
  conversation
  workspace: Workspace | null
}
```

**No se crea.** Motivos:

1. No hay segundo consumidor. WS no hidrata Workspace. El Runtime no puede recibirlo en esta fase.
2. El par se obtiene hoy con `getConversation` + `resolveWorkspaceForConversation`. Un wrapper duplicaría la misma lectura.
3. `Context` en el glosario es informal, no entidad. `ConversationContext` chocaría con esa regla.
4. PHASE 14 rechazó `WorkspaceContext`. Agrupar Conversation+Workspace sin uso es la misma anticipación.
5. Casual (`workspace_id` NULL) ya es `null` en el resolver; no hace falta un objeto para representarlo.

Cuando exista un consumidor de Gateway (API de asociación, Active Workspace, o hidratación explícita en el turn **sin** pasarlo al Runtime), se puede componer el par en el call site. Un tipo compartido solo se justifica si hay **más de un** consumidor.

## 3. CURRENT

```text
Session                         transporte
   │
   ▼
Gateway
   ├── Conversation.workspace_id  ──► resolveWorkspaceForConversation
   │                                      → Workspace | null
   └── Agent Runtime
            └── no conoce Workspace
```

Casual: `workspace = null`. Trabajo: el Workspace persistido. Solo `Conversation.workspace_id`. Sin heurística.

`startServer.workspaces` está compuesto pero **no** se usa en el path WS. Eso es deuda de consumo, no falta de tipo.

## 4. FUTURE (no implementado)

- Primer consumidor Gateway de `resolveWorkspaceForConversation` (sin Runtime).
- Active Workspace (preferencia user/device, no Session).
- Asociación Conversation↔Workspace visible al cliente (protocolo o HTTP; no en PHASE 15).
- Workspace-aware Agent / Tools.
- Knowledge, Artifacts, RAG, voz, A2A, multi-Agent.

## 5. Recomendación PHASE 16

No repetir otra auditoría del mismo objeto. No crear `ConversationContext` «por si acaso».

Siguiente trabajo útil, **si hay necesidad de producto**: un consumidor explícito en el Gateway (p. ej. asociar o listar Workspace de una Conversation) **sin** `runTurn`, **sin** `workspaceId` en WS hasta que una operación existente lo exija, **sin** Runtime/MCP/Node.

A2A, multi-Agent, `agentId`, `nodeId`, Knowledge y Artifacts siguen fuera.

## 6. Qué no se implementó

Agent Runtime, `runTurn`, protocolo WS, Session, Active Workspace, inferencia, creación automática, MCP, Node, A2A, multi-Agent, agentId, nodeId, Knowledge, Artifacts, RAG, voz, WorkspaceManager, registries, `ConversationContext`.
