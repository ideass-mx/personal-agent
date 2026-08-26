/** Tipos del contrato HTTP PHASE 16. No es el protocolo WS. */

export type Workspace = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WorkspaceCreateInput = {
  name: string;
  description?: string | null;
};

export type WorkspaceUpdateInput = {
  name?: string;
  description?: string | null;
};

/** Creación explícita. workspaceId omitido o null = casual. */
export type ConversationCreateInput = {
  workspaceId?: string | null;
  title?: string | null;
};

/** Conversation en la API HTTP (workspaceId NULL = casual). */
export type ConversationRecord = {
  readonly id: string;
  readonly title: string | null;
  readonly createdAt: string;
  readonly workspaceId: string | null;
};

export type ConversationWorkspaceResult = {
  readonly conversation: ConversationRecord;
  readonly workspace: Workspace | null;
};

/** Mensaje persistido de una Conversation (HTTP GET messages). */
export type ConversationMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly deviceId: string | null;
  readonly createdAt: string;
};
