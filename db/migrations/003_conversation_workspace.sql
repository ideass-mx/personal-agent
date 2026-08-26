-- 003_conversation_workspace · relación opcional Conversation → Workspace
-- workspace_id NULL = conversación casual (sin Workspace).
-- ON DELETE SET NULL: borrar un Workspace no borra hilos ni mensajes.

ALTER TABLE conversations
    ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_workspace
    ON conversations(workspace_id);
