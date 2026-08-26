package mx.ideass.personal.agent.workspace

/**
 * Orquesta carga/mutación HTTP con generación para ignorar respuestas viejas.
 * Sin Session, sin Active Workspace.
 */
class ConversationWorkspaceCoordinator(
    private val gateway: WorkspaceGateway,
) {
    var state: ConversationWorkspaceUiState = ConversationWorkspaceUiState()
        private set

    private var loadGen = 0
    private var saveGen = 0

    fun setHubAvailable(available: Boolean) {
        state = if (available) {
            state.copy(hubAvailable = true)
        } else {
            ConversationWorkspaceUiState(hubAvailable = false)
        }
    }

    fun setMenuOpen(open: Boolean) {
        state = state.copy(menuOpen = open)
    }

    fun setCreateDialogOpen(open: Boolean) {
        state = state.copy(createDialogOpen = open, createName = if (open) state.createName else "")
    }

    fun setCreateName(name: String) {
        state = state.copy(createName = name)
    }

    suspend fun load(conversationId: String) {
        if (!state.hubAvailable) return
        val id = conversationId.trim()
        val gen = ++loadGen
        state = state.copy(
            conversationId = id,
            loading = true,
            errorMessage = null,
        )
        if (id.isEmpty()) {
            if (gen != loadGen) return
            state = state.copy(
                loading = false,
                conversationWorkspace = null,
                workspaces = emptyList(),
            )
            return
        }
        try {
            val listed = gateway.listWorkspaces()
            val associated = gateway.getConversationWorkspace(id)
            if (gen != loadGen) return
            state = state.copy(
                loading = false,
                workspaces = listed,
                conversationWorkspace = associated,
                errorMessage = null,
            )
        } catch (e: WorkspaceHttpException) {
            if (gen != loadGen) return
            state = state.copy(loading = false, errorMessage = userMessage(e))
        } catch (e: Exception) {
            if (gen != loadGen) return
            state = state.copy(loading = false, errorMessage = e.message ?: "Error de red.")
        }
    }

    suspend fun selectWorkspace(workspaceId: String?) {
        if (!state.hubAvailable) return
        val conversationId = state.conversationId.trim()
        if (conversationId.isEmpty()) return
        val gen = ++saveGen
        state = state.copy(saving = true, errorMessage = null, menuOpen = false)
        try {
            val result = if (workspaceId == null) {
                gateway.clearConversationWorkspace(conversationId)
            } else {
                gateway.setConversationWorkspace(conversationId, workspaceId)
            }
            if (gen != saveGen) return
            state = state.copy(
                saving = false,
                conversationWorkspace = result.workspace,
                errorMessage = null,
            )
        } catch (e: WorkspaceHttpException) {
            if (gen != saveGen) return
            state = state.copy(saving = false, errorMessage = userMessage(e))
        } catch (e: Exception) {
            if (gen != saveGen) return
            state = state.copy(saving = false, errorMessage = e.message ?: "Error de red.")
        }
    }

    suspend fun createWorkspace(useAfterCreate: Boolean) {
        if (!state.hubAvailable) return
        val name = state.createName.trim()
        if (name.isEmpty()) {
            state = state.copy(errorMessage = "El nombre no puede estar vacío.")
            return
        }
        state = state.copy(creating = true, errorMessage = null)
        try {
            val created = gateway.createWorkspace(name)
            val listed = gateway.listWorkspaces()
            state = state.copy(
                creating = false,
                workspaces = listed,
                createDialogOpen = false,
                createName = "",
            )
            if (useAfterCreate) {
                selectWorkspace(created.id)
            }
        } catch (e: WorkspaceHttpException) {
            state = state.copy(creating = false, errorMessage = userMessage(e))
        } catch (e: Exception) {
            state = state.copy(creating = false, errorMessage = e.message ?: "Error de red.")
        }
    }

    private fun userMessage(e: WorkspaceHttpException): String = when (e.kind) {
        WorkspaceHttpKind.Unauthorized -> "No autorizado. Revisa el token del Hub."
        WorkspaceHttpKind.NotFound -> e.message
        WorkspaceHttpKind.BadRequest -> e.message
        WorkspaceHttpKind.Conflict -> e.message
        WorkspaceHttpKind.Gateway -> "El Hub no pudo completar la operación."
        WorkspaceHttpKind.Network -> "Sin red. Inténtalo de nuevo."
    }
}
