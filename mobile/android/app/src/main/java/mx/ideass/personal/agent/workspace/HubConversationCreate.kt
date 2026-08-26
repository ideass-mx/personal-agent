package mx.ideass.personal.agent.workspace

/**
 * Intención de crear Conversation en el Gateway.
 * [workspaceId] null = casual explícito; no hereda el Workspace del hilo actual.
 */
data class HubConversationCreateRequest(
    val title: String,
    val workspaceId: String?,
)

fun hubCasualConversation(title: String): HubConversationCreateRequest =
    HubConversationCreateRequest(title = title.trim(), workspaceId = null)

fun hubConversationInWorkspace(
    title: String,
    workspaceId: String,
): HubConversationCreateRequest {
    val id = workspaceId.trim()
    require(id.isNotEmpty()) { "workspaceId requerido para crear en Workspace." }
    return HubConversationCreateRequest(title = title.trim(), workspaceId = id)
}

suspend fun executeHubConversationCreate(
    gateway: WorkspaceGateway,
    request: HubConversationCreateRequest,
): ConversationRecordDto {
    val title = request.title.takeIf { it.isNotEmpty() }
    return gateway.createConversation(title, request.workspaceId)
}
