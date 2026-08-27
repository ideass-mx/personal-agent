package mx.ideass.personal.agent.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private val _hydration = MutableStateFlow(HistoryHydrationUi())
    val hydration: StateFlow<HistoryHydrationUi> = _hydration.asStateFlow()

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
                    if (!key.hubOk || !key.connected) {
                        _hydration.value = HistoryHydrationUi(HistoryHydrationStatus.Idle)
                        return@collectLatest
                    }
                    val conversationId = key.sessionKey?.trim().orEmpty()
                    if (conversationId.isEmpty()) {
                        _hydration.value = HistoryHydrationUi(HistoryHydrationStatus.Idle)
                        return@collectLatest
                    }
                    key.hub?.let { workspaceGateway.configure(it.address, it.token) }
                    hydrateIfIdle(conversationId)
                }
        }
    }

    /** Reintento manual desde la UI (PHASE 39). */
    fun retryActive() {
        scope.launch {
            val key = sessionProvider.activeSession.value?.sessionKey?.trim().orEmpty()
            if (key.isEmpty()) return@launch
            if (preferences.getConnectionBackend() != ConnectionBackend.HUB) return@launch
            hydrateIfIdle(key, force = true)
        }
    }

    /** Visible para tests: carga historial si la sesión sigue activa y sin stream en vuelo. */
    suspend fun hydrateIfIdle(conversationId: String, force: Boolean = false) {
        val key = conversationId.trim()
        if (key.isEmpty()) return
        if (sessionProvider.activeSession.value?.sessionKey != key) return
        if (!force && chatStore.hasAssistantWork(key)) return
        _hydration.value = HistoryHydrationUi(HistoryHydrationStatus.Loading, key)
        try {
            val remote = workspaceGateway.getConversationMessages(key)
            if (sessionProvider.activeSession.value?.sessionKey != key) return
            chatStore.replaceThread(key, HubHistoryMapper.toChatMessages(remote))
            _hydration.value = HistoryHydrationUi(HistoryHydrationStatus.Ready, key)
        } catch (_: WorkspaceHttpException) {
            _hydration.value = HistoryHydrationUi(HistoryHydrationStatus.Error, key)
        }
    }

    private data class SyncKey(
        val sessionKey: String?,
        val hubOk: Boolean,
        val hub: HubConfig?,
        val connected: Boolean,
    )
}
