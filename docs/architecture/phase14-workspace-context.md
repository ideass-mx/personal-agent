# PHASE 14 — Workspace context resolution

**Estado:** CLOSED (resolver Gateway stateless; sin protocolo, Active Workspace ni Runtime).  
**Fecha:** 2026-08-25.

## Auditoría

PHASE 12–13 CLOSED. `workspaces` persistente. `conversations.workspace_id` nullable, `ON DELETE SET NULL`. Session ≠ Conversation. Runtime/MCP/Node sin Workspace. WS sin `workspaceId`. Sin agentId/nodeId/A2A/multi-Agent.

Ninguna operación existente exigía `workspaceId` en el protocolo: `user_message.conversationId` basta para resolver en el Gateway.

## CURRENT

```text
Conversation
   └── workspace_id nullable ──► Workspace

Gateway / aplicación
   └── resolveWorkspaceForConversation(conversationId, WorkspaceStore)
          → Workspace | null

Agent Runtime
   └── no conoce Workspace
```

Función: `hub/src/memory/resolve-workspace-for-conversation.ts`.  
Lee Conversation (dueña de la relación) y luego `WorkspaceStore.getWorkspace`. El store **no** importa Conversation.

| Entrada | Resultado |
|---------|-----------|
| Conversation inexistente | error explícito |
| `workspace_id` NULL | `null` (casual) |
| Workspace existe | ese Workspace |
| `workspace_id` huérfano | error `Workspace inconsistente` (fail-closed; no SET NULL automático) |
| Tras `deleteWorkspace` | `null` (SET NULL de PHASE 13) |

Sin Session. Dos Sessions con el mismo `conversationId` resuelven el mismo Workspace.

Sin migración nueva.

## FUTURE (no implementado)

Active Workspace (preferencia user/device), contexto Workspace-aware en el Agent, voz, Knowledge, Artifacts, A2A, multi-Agent.

## Decisiones

- No `WorkspaceManager` / `WorkspaceContext`.
- No inferencia ni creación automática.
- No `workspaceId` en WS.
- Runtime, MCP, Node, Tools, AgentDefinition, ConfirmationPort intactos.
