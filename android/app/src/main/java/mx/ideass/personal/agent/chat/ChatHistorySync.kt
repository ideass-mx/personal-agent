package mx.ideass.personal.agent.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.gateway.client.GatewayClient
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ConnectionState
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Al activar una sesión (o reconectar), pide `chat.history` de esa key y
 * fusiona con el hilo local sin duplicar.
 */
@Singleton
class ChatHistorySync @Inject constructor(
    private val sessionProvider: SessionProvider,
    private val chatStore: ChatStore,
    private val gatewayClient: GatewayClient,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            combine(
                sessionProvider.activeSession.map { it?.sessionKey },
                gatewayClient.connectionState,
            ) { sessionKey, state -> sessionKey to state }
                .distinctUntilChanged()
                .collectLatest { (sessionKey, state) ->
                    if (sessionKey.isNullOrBlank()) return@collectLatest
                    if (state !is ConnectionState.Conectado) return@collectLatest
                    if (!gatewayClient.isConnected()) return@collectLatest
                    loadAndMerge(sessionKey)
                }
        }
    }

    /** Visible para tests: carga history de [sessionKey] y mergea si sigue activa. */
    suspend fun loadAndMerge(sessionKey: String, limit: Int = DEFAULT_HISTORY_LIMIT) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        val active = sessionProvider.activeSession.value
        val result = gatewayClient.loadHistory(
            sessionKey = key,
            agentId = active?.agentId,
            limit = limit,
        ) ?: return
        // Ignora respuestas stale si el usuario ya cambió de sesión.
        if (sessionProvider.activeSession.value?.sessionKey != key) return
        val remote = ChatHistoryMapper.toChatMessages(result)
        chatStore.mergeRemoteHistory(key, remote)
    }

    companion object {
        const val DEFAULT_HISTORY_LIMIT: Int = 100
    }
}
