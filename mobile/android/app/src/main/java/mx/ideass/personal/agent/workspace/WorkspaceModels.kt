package mx.ideass.personal.agent.workspace

import kotlinx.serialization.Serializable

/** Workspace persistente del Gateway. No es Active Workspace. */
@Serializable
data class WorkspaceDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class WorkspaceListResponse(
    val workspaces: List<WorkspaceDto>,
)

@Serializable
data class ConversationWorkspaceResponse(
    val conversationId: String,
    val workspace: WorkspaceDto? = null,
)

@Serializable
data class ConversationRecordDto(
    val id: String,
    val title: String? = null,
    val createdAt: String,
    val workspaceId: String? = null,
)

@Serializable
data class ConversationMessageDto(
    val id: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val deviceId: String? = null,
    val createdAt: String,
)

@Serializable
data class ConversationWorkspacePatchResponse(
    val conversation: ConversationRecordDto,
    val workspace: WorkspaceDto? = null,
)

@Serializable
data class GatewayErrorBody(
    val error: GatewayErrorDetail? = null,
)

@Serializable
data class GatewayErrorDetail(
    val code: String? = null,
    val message: String? = null,
)

enum class WorkspaceHttpKind {
    Unauthorized,
    NotFound,
    BadRequest,
    Conflict,
    Gateway,
    Network,
}

class WorkspaceHttpException(
    val kind: WorkspaceHttpKind,
    val status: Int,
    override val message: String,
    val code: String? = null,
) : Exception(message)

fun kindForStatus(status: Int): WorkspaceHttpKind = when (status) {
    401, 403 -> WorkspaceHttpKind.Unauthorized
    404 -> WorkspaceHttpKind.NotFound
    400, 422 -> WorkspaceHttpKind.BadRequest
    409 -> WorkspaceHttpKind.Conflict
    else -> if (status >= 500) WorkspaceHttpKind.Gateway else WorkspaceHttpKind.Gateway
}
