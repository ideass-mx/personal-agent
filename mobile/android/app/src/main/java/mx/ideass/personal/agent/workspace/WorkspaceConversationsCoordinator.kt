package mx.ideass.personal.agent.workspace

/**
 * Listado Workspace → Conversations (PHASE 22).
 * No es Active Workspace: listingWorkspace es el Workspace abierto en esta pantalla.
 */
data class WorkspaceConversationsUiState(
    val listingWorkspace: WorkspaceDto? = null,
    val conversations: List<ConversationRecordDto> = emptyList(),
    val loading: Boolean = false,
    val errorMessage: String? = null,
)

fun conversationListTitle(record: ConversationRecordDto): String =
    record.title?.trim()?.takeIf { it.isNotEmpty() } ?: record.id

fun sortWorkspaceConversations(
    records: List<ConversationRecordDto>,
): List<ConversationRecordDto> =
    records.sortedWith(
        compareByDescending<ConversationRecordDto> { it.createdAt }
            .thenByDescending { it.id },
    )

class WorkspaceConversationsCoordinator(
    private val gateway: WorkspaceGateway,
) {
    var state: WorkspaceConversationsUiState = WorkspaceConversationsUiState()
        private set

    private var loadGen = 0

    fun close() {
        loadGen += 1
        state = WorkspaceConversationsUiState()
    }

    suspend fun open(workspace: WorkspaceDto) {
        val gen = ++loadGen
        state = state.copy(
            listingWorkspace = workspace,
            loading = true,
            errorMessage = null,
            conversations = emptyList(),
        )
        try {
            val listed = gateway.listWorkspaceConversations(workspace.id)
            if (gen != loadGen) return
            state = state.copy(
                loading = false,
                conversations = listed,
                errorMessage = null,
            )
        } catch (e: WorkspaceHttpException) {
            if (gen != loadGen) return
            state = state.copy(loading = false, errorMessage = e.message, conversations = emptyList())
        } catch (e: Exception) {
            if (gen != loadGen) return
            state = state.copy(
                loading = false,
                errorMessage = e.message ?: "Error de red.",
                conversations = emptyList(),
            )
        }
    }
}
