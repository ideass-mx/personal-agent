package mx.ideass.personal.agent.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import mx.ideass.personal.agent.app.ConnectionBackend
import org.junit.Assert.assertSame
import org.junit.Test

class RoutingChatConnectionBackendTest {

    private class StubChatConnection : ChatConnection {
        override val connectionState: StateFlow<ConnectionState> =
            MutableStateFlow(ConnectionState.SinConfigurar)
        override val inbound: SharedFlow<ChatInbound> = MutableSharedFlow()
        override fun start() = Unit
        override fun reconnectNow() = Unit
        override fun sendUserMessage(text: String, conversationId: String?) = Unit
        override fun sendConfirmResponse(confirmationId: String, approved: Boolean) = Unit
        override fun isConnected(): Boolean = false
        override suspend fun probe(
            address: String,
            token: String,
            deviceName: String,
        ): Result<Long> = Result.success(0L)
    }

    @Test
    fun hubBackend_selectsHub() {
        val hub = StubChatConnection()
        val gateway = StubChatConnection()
        assertSame(hub, chatConnectionForBackend(ConnectionBackend.HUB, hub, gateway))
    }

    @Test
    fun legacyGatewayBackend_selectsGateway() {
        val hub = StubChatConnection()
        val gateway = StubChatConnection()
        assertSame(gateway, chatConnectionForBackend(ConnectionBackend.GATEWAY, hub, gateway))
    }
}
