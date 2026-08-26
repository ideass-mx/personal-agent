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
                        _inbound.emit(
                            ChatInbound.AssistantDelta(
                                text = msg.text,
                                sessionKey = msg.conversationId,
                            ),
                        )
                    is ServerMessage.AssistantDone ->
                        _inbound.emit(ChatInbound.AssistantDone(msg.conversationId))
                    is ServerMessage.Error ->
                        _inbound.emit(
                            ChatInbound.Error(
                                code = msg.code,
                                message = msg.message,
                                sessionKey = msg.conversationId,
                            ),
                        )
                    is ServerMessage.ConfirmRequest ->
                        _inbound.emit(
                            ChatInbound.ConfirmRequest(
                                confirmationId = msg.confirmationId,
                                toolCallId = msg.toolCallId,
                                toolName = msg.toolName,
                                inputJson = msg.input.toString(),
                                conversationId = msg.conversationId,
                            ),
                        )
                    else -> Unit
                }
            }
        }
    }

    override fun start() = hubClient.start()

    override fun reconnectNow() = hubClient.reconnectNow()

    override fun sendUserMessage(text: String, conversationId: String?) =
        hubClient.sendUserMessage(text, conversationId)

    override fun sendConfirmResponse(confirmationId: String, approved: Boolean) =
        hubClient.sendConfirmResponse(confirmationId, approved)

    override fun isConnected(): Boolean = hubClient.isConnected()

    override suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long> = hubClient.probe(address, token, deviceName)
}
