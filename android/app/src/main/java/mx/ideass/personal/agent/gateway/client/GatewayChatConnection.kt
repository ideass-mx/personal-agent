package mx.ideass.personal.agent.gateway.client

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.network.ConnectionState
import javax.inject.Inject
import javax.inject.Singleton

/** Adaptador de [GatewayClient] al contrato [ChatConnection] de la UI. */
@Singleton
class GatewayChatConnection @Inject constructor(
    private val gatewayClient: GatewayClient,
) : ChatConnection {
    override val connectionState: StateFlow<ConnectionState> = gatewayClient.connectionState
    override val inbound: SharedFlow<ChatInbound> = gatewayClient.inbound

    override fun start() = gatewayClient.start()

    override fun reconnectNow() = gatewayClient.reconnectNow()

    override fun sendUserMessage(text: String, conversationId: String?) =
        gatewayClient.sendUserMessage(text, conversationId)

    override fun isConnected(): Boolean = gatewayClient.isConnected()

    override suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long> {
        // Probe real del Gateway requiere challenge+connect; se valida al guardar config.
        if (address.isBlank() || token.isBlank()) {
            return Result.failure(IllegalArgumentException("URL y token son obligatorios"))
        }
        return Result.success(0L)
    }
}
