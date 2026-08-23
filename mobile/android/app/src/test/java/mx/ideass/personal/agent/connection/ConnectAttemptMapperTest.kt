package mx.ideass.personal.agent.connection

import mx.ideass.personal.agent.gateway.client.humanizeConnectError
import mx.ideass.personal.agent.gateway.protocol.ConnectErrorCodes
import mx.ideass.personal.agent.network.ConnectionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectAttemptMapperTest {
    @Test
    fun connectedOnlyAfterHelloOkState() {
        assertTrue(shouldNavigateToChat(ConnectionState.Conectado))
        assertFalse(shouldNavigateToChat(ConnectionState.Reconectando(0)))
        assertFalse(shouldNavigateToChat(ConnectionState.Emparejando))
        assertFalse(shouldNavigateToChat(ConnectionState.SinConfigurar))
        assertFalse(
            shouldNavigateToChat(
                ConnectionState.Error("Token inválido", ConnectErrorCodes.AUTH_TOKEN_MISMATCH),
            ),
        )
    }

    @Test
    fun mapsConnectionStateToAttemptUi() {
        assertEquals(
            ConnectAttemptUi.Connected,
            mapConnectionStateToAttempt(ConnectionState.Conectado),
        )
        assertEquals(
            ConnectAttemptUi.Connecting,
            mapConnectionStateToAttempt(ConnectionState.Reconectando(3)),
        )
        assertEquals(
            ConnectAttemptUi.Pairing("abcd1234"),
            mapConnectionStateToAttempt(ConnectionState.Emparejando, "abcd1234"),
        )
        assertEquals(
            ConnectAttemptUi.Failed("Token inválido (AUTH_TOKEN_MISMATCH)", ConnectErrorCodes.AUTH_TOKEN_MISMATCH),
            mapConnectionStateToAttempt(
                ConnectionState.Error(
                    humanizeConnectError(ConnectErrorCodes.AUTH_TOKEN_MISMATCH, null),
                    ConnectErrorCodes.AUTH_TOKEN_MISMATCH,
                ),
            ),
        )
    }

    @Test
    fun shortDeviceIdTruncates() {
        assertEquals("abcdef12", shortDeviceId("abcdef1234567890"))
        assertEquals("short", shortDeviceId("short"))
    }
}
