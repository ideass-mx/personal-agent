package mx.ideass.personal.agent.workspace

/**
 * Puerto HTTP de Workspace (mismo contrato que @mxideass/workspace-http).
 * Android no puede importar el paquete npm; esta es la adaptación OkHttp.
 */
interface WorkspaceGateway {
    fun configure(baseUrl: String, token: String)
    suspend fun listWorkspaces(): List<WorkspaceDto>
    suspend fun createWorkspace(name: String, description: String? = null): WorkspaceDto
    suspend fun createConversation(
        title: String? = null,
        workspaceId: String? = null,
    ): ConversationRecordDto
    suspend fun getWorkspace(id: String): WorkspaceDto
    suspend fun listWorkspaceConversations(workspaceId: String): List<ConversationRecordDto>
    suspend fun getConversationWorkspace(conversationId: String): WorkspaceDto?
    suspend fun setConversationWorkspace(
        conversationId: String,
        workspaceId: String,
    ): ConversationWorkspacePatchResponse
    suspend fun clearConversationWorkspace(
        conversationId: String,
    ): ConversationWorkspacePatchResponse
    suspend fun getConversationMessages(conversationId: String): List<ConversationMessageDto>
}
