/**
 * Puerto de persistencia de Workspace. Sin SQLite, WS, MCP ni Runtime.
 * Conversation no está aquí: la relación opcional vive en Conversation/Gateway.
 */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WorkspaceCreateInput = {
  name: string;
  description?: string | null;
};

export type WorkspaceUpdateInput = {
  name?: string;
  description?: string | null;
};

export interface WorkspaceStore {
  createWorkspace(input: WorkspaceCreateInput): Workspace;
  getWorkspace(id: string): Workspace | undefined;
  listWorkspaces(): Workspace[];
  updateWorkspace(id: string, patch: WorkspaceUpdateInput): Workspace | undefined;
  deleteWorkspace(id: string): boolean;
}
