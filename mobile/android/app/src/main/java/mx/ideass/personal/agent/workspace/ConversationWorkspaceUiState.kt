package mx.ideass.personal.agent.workspace

/**
 * Estado de Workspace de la Conversation actual.
 * No es Active Workspace: conversationWorkspace = asociación persistida.
 */
data class ConversationWorkspaceUiState(
    val hubAvailable: Boolean = false,
    val conversationId: String = "",
    val workspaces: List<WorkspaceDto> = emptyList(),
    val conversationWorkspace: WorkspaceDto? = null,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val creating: Boolean = false,
    val errorMessage: String? = null,
    val menuOpen: Boolean = false,
    val createDialogOpen: Boolean = false,
    val createName: String = "",
)

fun ConversationWorkspaceUiState.label(): String {
    if (!hubAvailable) return ""
    if (loading) return "Workspace…"
    return conversationWorkspace?.name ?: "Sin Workspace"
}
