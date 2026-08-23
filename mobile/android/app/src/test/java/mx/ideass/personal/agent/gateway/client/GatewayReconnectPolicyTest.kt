package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.protocol.ConnectErrorCodes
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayReconnectPolicyTest {

    @Test
    fun terminalAuth_stopsLoop() {
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_SCOPE_MISMATCH))
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_TOKEN_MISSING))
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_PASSWORD_MISMATCH))
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_BOOTSTRAP_TOKEN_INVALID))
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.DEVICE_IDENTITY_REQUIRED))
        assertTrue(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.CLIENT_VERSION_MISMATCH))
    }

    @Test
    fun recoverable_keepsRetrying() {
        assertFalse(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.PAIRING_REQUIRED))
        assertFalse(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_DEVICE_TOKEN_MISMATCH))
        assertFalse(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_TOKEN_MISMATCH))
        assertFalse(GatewayReconnectPolicy.isTerminalAuth(ConnectErrorCodes.AUTH_RATE_LIMITED))
        assertFalse(GatewayReconnectPolicy.isTerminalAuth("TIMEOUT"))
        assertFalse(GatewayReconnectPolicy.isTerminalAuth(null))
    }
}
