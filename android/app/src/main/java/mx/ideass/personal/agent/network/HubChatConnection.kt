package mx.ideass.personal.agent.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.protocol.ServerMessage
import javax.inject.Inject
import javax.inject.Singleton

/** Adaptador del hub legacy al contrato [ChatConnection]. */
@Singleton
class HubChatConnection @Inject constructor(
    private val hubClient: HubClient,
) : ChatConnection {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _inbound = MutableSharedFlow<ChatInbound>(extraBufferCapacity = 64)
    override val inbound: SharedFlow<ChatInbound> = _inbound.asSharedFlow()

    override val connectionState: StateFlow<ConnectionState> = hubClient.connectionState

    init {
        scope.launch {
            hubClient.serverMessages.collect { msg ->
                when (msg) {
                    is ServerMessage.AssistantChunk ->
                        _inbound.emit(ChatInbound.AssistantDelta(msg.text))
                    is ServerMessage.AssistantDone ->
                        _inbound.emit(ChatInbound.AssistantDone(msg.conversationId))
                    is ServerMessage.Error ->
                        _inbound.emit(ChatInbound.Error(msg.code, msg.message))
                    else -> Unit
                }
            }
        }
    }

    override fun start() = hubClient.start()

    override fun reconnectNow() = hubClient.reconnectNow()

    override fun sendUserMessage(text: String, conversationId: String?) =
        hubClient.sendUserMessage(text, conversationId)

    override fun isConnected(): Boolean = hubClient.isConnected()

    override suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long> = hubClient.probe(address, token, deviceName)
}
