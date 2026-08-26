/**
 * Resolución de Workspace desde Conversation (Gateway).
 * Stateless. No es Active Workspace. WorkspaceStore no conoce Conversation.
 */
import type { Workspace, WorkspaceStore } from "../workspace/types.ts";
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";
import { getConversation } from "./conversation-workspace.ts";

export function resolveWorkspaceForConversation(
  conversationId: string,
  workspaces: Pick<WorkspaceStore, "getWorkspace">,
  sql?: WorkspaceSqlDb,
): Workspace | null {
  const conversation = getConversation(conversationId, sql);
  if (!conversation) {
    throw new Error(`Conversation inexistente: ${conversationId}.`);
  }
  if (conversation.workspaceId === null) {
    return null;
  }
  const workspace = workspaces.getWorkspace(conversation.workspaceId);
  if (!workspace) {
    throw new Error(
      `Workspace inconsistente: la conversación ${conversationId} apunta a ${conversation.workspaceId}, que no existe.`,
    );
  }
  return workspace;
}
