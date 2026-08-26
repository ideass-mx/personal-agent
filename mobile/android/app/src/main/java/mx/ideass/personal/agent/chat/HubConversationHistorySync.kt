package mx.ideass.personal.agent.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.app.HubConfig
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.workspace.WorkspaceGateway
import mx.ideass.personal.agent.workspace.WorkspaceHttpException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Rehidrata el transcript Hub desde SQLite vía GET /conversations/:id/messages.
 * DataStore queda como cache UI; el Gateway es autoridad del historial persistido.
 */
@Singleton
class HubConversationHistorySync @Inject constructor(
    private val sessionProvider: SessionProvider,
    private val chatStore: ChatStore,
    private val workspaceGateway: WorkspaceGateway,
    private val preferences: AppPreferences,
    private val chatConnection: ChatConnection,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            combine(
                sessionProvider.activeSession,
                preferences.connectionBackend,
                preferences.hubConfig,
                chatConnection.connectionState,
            ) { active, backend, hub, state ->
                SyncKey(
                    sessionKey = active?.sessionKey,
                    hubOk = backend == ConnectionBackend.HUB && hub != null,
                    hub = hub,
                    connected = state is ConnectionState.Conectado && chatConnection.isConnected(),
                )
            }
                .distinctUntilChanged()
                .collectLatest { key ->
                    if (!key.hubOk || !key.connected) return@collectLatest
                    val conversationId = key.sessionKey?.trim().orEmpty()
                    if (conversationId.isEmpty()) return@collectLatest
                    key.hub?.let { workspaceGateway.configure(it.address, it.token) }
                    hydrateIfIdle(conversationId)
                }
        }
    }

    /** Visible para tests: carga historial si la sesión sigue activa y sin stream en vuelo. */
    suspend fun hydrateIfIdle(conversationId: String) {
        val key = conversationId.trim()
        if (key.isEmpty()) return
        if (sessionProvider.activeSession.value?.sessionKey != key) return
        if (chatStore.hasAssistantWork(key)) return
        try {
            val remote = workspaceGateway.getConversationMessages(key)
            if (sessionProvider.activeSession.value?.sessionKey != key) return
            chatStore.replaceThread(key, HubHistoryMapper.toChatMessages(remote))
        } catch (_: WorkspaceHttpException) {
            // 404 u otros: conservar cache local; no bloquear chat.
        }
    }

    private data class SyncKey(
        val sessionKey: String?,
        val hubOk: Boolean,
        val hub: HubConfig?,
        val connected: Boolean,
    )
}
