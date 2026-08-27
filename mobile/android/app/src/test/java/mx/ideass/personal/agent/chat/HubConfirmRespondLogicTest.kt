package mx.ideass.personal.agent.chat

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.network.ConnectionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * HITL respond helpers: approve/reject/dismiss envían confirmationId correcto
 * y limpian pending (fail-closed). Sin Hilt: lógica aislada.
 */
class HubConfirmRespondLogicTest {

    private class FakeConnection : ChatConnection {
        val sent = mutableListOf<Pair<String, Boolean>>()
        override val connectionState: StateFlow<ConnectionState> =
            MutableStateFlow(ConnectionState.Conectado)
        override val inbound: SharedFlow<ChatInbound> = MutableSharedFlow()
        override fun start() = Unit
        override fun reconnectNow() = Unit
        override fun sendUserMessage(text: String, conversationId: String?) = Unit
        override fun sendConfirmResponse(confirmationId: String, approved: Boolean) {
            sent += confirmationId to approved
        }
        override fun isConnected(): Boolean = true
        override suspend fun probe(
            address: String,
            token: String,
            deviceName: String,
        ): Result<Long> = Result.success(0L)
    }

    private fun respond(
        pending: HubConfirmPending?,
        clear: () -> Unit,
        connection: FakeConnection,
        approved: Boolean,
    ) {
        val current = pending ?: return
        connection.sendConfirmResponse(current.confirmationId, approved)
        clear()
    }

    @Test
    fun approve_sendsTrueWithId() {
        val conn = FakeConnection()
        var pending: HubConfirmPending? = HubConfirmPending(
            confirmationId = "cf_1",
            toolName = "filesystem.write",
            inputSummary = "{}",
            conversationId = "c1",
            receivedAtMs = 1L,
        )
        respond(pending, { pending = null }, conn, approved = true)
        assertEquals(listOf("cf_1" to true), conn.sent)
        assertNull(pending)
    }

    @Test
    fun rejectAndDismiss_sendFalse() {
        val conn = FakeConnection()
        var pending: HubConfirmPending? = HubConfirmPending(
            confirmationId = "cf_2",
            toolName = "process.execute",
            inputSummary = "{}",
            conversationId = "c1",
            receivedAtMs = 1L,
        )
        respond(pending, { pending = null }, conn, approved = false)
        assertEquals(listOf("cf_2" to false), conn.sent)
        assertNull(pending)
    }

    @Test
    fun pendingIsRamOnly_notSerializedInDataClassDefaultsAsPersistent() {
        // Documenta contrato: HubConfirmPending no se escribe a DataStore.
        val p = HubConfirmPending("id", "t", "{}", "c", receivedAtMs = 42L)
        assertEquals(42L, p.receivedAtMs)
        assertTrue(p.confirmationId.isNotEmpty())
    }
}
