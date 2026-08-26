package mx.ideass.personal.agent.workspace

import kotlinx.coroutines.delay

class FakeWorkspaceGateway : WorkspaceGateway {
    var workspaces = linkedMapOf<String, WorkspaceDto>()
    var conversations = linkedMapOf<String, ConversationRecordDto>()
    var association = mutableMapOf<String, String?>()
    var messagesByConversation = mutableMapOf<String, List<ConversationMessageDto>>()
    var failKind: WorkspaceHttpKind? = null
    var failStatus: Int = 500
    var delayMs: Long = 0
    var listCalls = 0
    var getCalls = 0
    var configureCalls = 0

    override fun configure(baseUrl: String, token: String) {
        configureCalls += 1
    }

    private fun dto(id: String, name: String) = WorkspaceDto(
        id = id,
        name = name,
        description = null,
        createdAt = "t",
        updatedAt = "t",
    )

    fun addWorkspace(id: String, name: String): WorkspaceDto {
        val w = dto(id, name)
        workspaces[id] = w
        return w
    }

    private suspend fun maybeFail() {
        if (delayMs > 0) delay(delayMs)
        val kind = failKind ?: return
        throw WorkspaceHttpException(kind, failStatus, "fallo $kind")
    }

    override suspend fun listWorkspaces(): List<WorkspaceDto> {
        maybeFail()
        listCalls += 1
        return workspaces.values.toList()
    }

    override suspend fun createWorkspace(name: String, description: String?): WorkspaceDto {
        maybeFail()
        val w = dto("w_${workspaces.size + 1}", name)
        workspaces[w.id] = w
        return w
    }

    override suspend fun createConversation(
        title: String?,
        workspaceId: String?,
    ): ConversationRecordDto {
        maybeFail()
        if (workspaceId != null) {
            workspaces[workspaceId] ?: throw WorkspaceHttpException(
                WorkspaceHttpKind.NotFound,
                404,
                "Workspace inexistente.",
            )
        }
        val id = "c_${conversations.size + 1}"
        val rec = ConversationRecordDto(
            id = id,
            title = title,
            createdAt = "t",
            workspaceId = workspaceId,
        )
        conversations[id] = rec
        association[id] = workspaceId
        return rec
    }

    fun removeWorkspace(id: String) {
        workspaces.remove(id)
        conversations.replaceAll { _, rec ->
            if (rec.workspaceId == id) rec.copy(workspaceId = null) else rec
        }
        association.replaceAll { _, wsId -> if (wsId == id) null else wsId }
    }

    override suspend fun getWorkspace(id: String): WorkspaceDto {
        maybeFail()
        return workspaces[id] ?: throw WorkspaceHttpException(
            WorkspaceHttpKind.NotFound,
            404,
            "Workspace inexistente.",
        )
    }

    override suspend fun listWorkspaceConversations(workspaceId: String): List<ConversationRecordDto> {
        maybeFail()
        workspaces[workspaceId] ?: throw WorkspaceHttpException(
            WorkspaceHttpKind.NotFound,
            404,
            "Workspace inexistente.",
        )
        return sortWorkspaceConversations(
            conversations.values.filter { it.workspaceId == workspaceId },
        )
    }

    override suspend fun getConversationWorkspace(conversationId: String): WorkspaceDto? {
        maybeFail()
        getCalls += 1
        if (!association.containsKey(conversationId) && conversationId == "c_missing") {
            throw WorkspaceHttpException(WorkspaceHttpKind.NotFound, 404, "Conversation inexistente.")
        }
        val wsId = association[conversationId]
        return wsId?.let { workspaces[it] }
    }

    override suspend fun setConversationWorkspace(
        conversationId: String,
        workspaceId: String,
    ): ConversationWorkspacePatchResponse {
        maybeFail()
        val w = workspaces[workspaceId] ?: throw WorkspaceHttpException(
            WorkspaceHttpKind.NotFound,
            404,
            "Workspace inexistente.",
        )
        association[conversationId] = workspaceId
        val rec = ConversationRecordDto(
            id = conversationId,
            title = conversations[conversationId]?.title,
            createdAt = conversations[conversationId]?.createdAt ?: "t",
            workspaceId = workspaceId,
        )
        conversations[conversationId] = rec
        return ConversationWorkspacePatchResponse(
            conversation = rec,
            workspace = w,
        )
    }

    override suspend fun clearConversationWorkspace(
        conversationId: String,
    ): ConversationWorkspacePatchResponse {
        maybeFail()
        association[conversationId] = null
        val rec = ConversationRecordDto(
            id = conversationId,
            title = conversations[conversationId]?.title,
            createdAt = conversations[conversationId]?.createdAt ?: "t",
            workspaceId = null,
        )
        conversations[conversationId] = rec
        return ConversationWorkspacePatchResponse(
            conversation = rec,
            workspace = null,
        )
    }

    override suspend fun getConversationMessages(
        conversationId: String,
    ): List<ConversationMessageDto> {
        maybeFail()
        if (!conversations.containsKey(conversationId) && !association.containsKey(conversationId)) {
            throw WorkspaceHttpException(
                WorkspaceHttpKind.NotFound,
                404,
                "Conversation inexistente.",
            )
        }
        return messagesByConversation[conversationId].orEmpty()
    }
}
