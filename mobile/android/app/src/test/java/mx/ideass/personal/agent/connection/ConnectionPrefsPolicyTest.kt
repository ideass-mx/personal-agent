package mx.ideass.personal.agent.connection

import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.gateway.config.ClientAuthMode
import mx.ideass.personal.agent.network.ConnectionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionPrefsPolicyTest {

    @Test
    fun missingBackend_usesGatewayUrlIfPresent() {
        val backend = ConnectionPrefsPolicy.backendFromStored(
            storedBackend = null,
            gatewayUrl = "wss://tailscale:18789",
            hubAddress = null,
            hubToken = null,
        )
        assertEquals(ConnectionBackend.GATEWAY, backend)
        assertTrue(
            ConnectionPrefsPolicy.isConfigured(
                backend,
                gatewayUrl = "wss://tailscale:18789",
                hubAddress = null,
                hubToken = null,
            ),
        )
        val config = ConnectionPrefsPolicy.toGatewayConfig(
            backend = backend,
            url = "wss://tailscale:18789",
            token = "secret",
            bootstrap = null,
            agentId = null,
            sessionKey = null,
            deviceName = "Pixel",
        )
        assertNotNull(config)
        assertEquals("wss://tailscale:18789", config!!.url)
        assertEquals("secret", config.sharedToken)
        assertEquals(ClientAuthMode.TOKEN, config.authMode)
    }

    @Test
    fun missingBackend_fallsBackToHubCredentials() {
        val backend = ConnectionPrefsPolicy.backendFromStored(
            storedBackend = null,
            gatewayUrl = null,
            hubAddress = "ws://10.0.2.2:8787",
            hubToken = "hub-token",
        )
        assertEquals(ConnectionBackend.HUB, backend)
        assertTrue(
            ConnectionPrefsPolicy.isConfigured(
                backend,
                gatewayUrl = null,
                hubAddress = "ws://10.0.2.2:8787",
                hubToken = "hub-token",
            ),
        )
        assertNull(
            ConnectionPrefsPolicy.toGatewayConfig(
                backend = backend,
                url = null,
                token = null,
                bootstrap = null,
                agentId = null,
                sessionKey = null,
                deviceName = null,
            ),
        )
    }

    @Test
    fun firstRun_notConfigured_defaultsToHub() {
        val backend = ConnectionPrefsPolicy.backendFromStored(
            storedBackend = null,
            gatewayUrl = null,
            hubAddress = null,
            hubToken = null,
        )
        assertEquals(ConnectionBackend.HUB, backend)
        assertFalse(
            ConnectionPrefsPolicy.isConfigured(
                backend,
                gatewayUrl = null,
                hubAddress = null,
                hubToken = null,
            ),
        )
        val form = connectionFormPrefill(
            backend = backend,
            gatewayUrl = null,
            gatewayToken = null,
            gatewayBootstrap = null,
            gatewayAgentId = null,
            gatewaySessionKey = null,
            hubAddress = null,
            hubToken = null,
            deviceName = null,
            fallbackDeviceName = "Android",
        )
        assertEquals(ConnectionBackend.HUB, form.backend)
        assertEquals("", form.address)
        assertEquals("", form.token)
        assertFalse(form.hasSavedConfig)
    }

    @Test
    fun explicitGatewayStored_keepsGateway legacy() {
        val backend = ConnectionPrefsPolicy.backendFromStored(
            storedBackend = "gateway",
            gatewayUrl = "wss://host:18789",
            hubAddress = null,
            hubToken = null,
        )
        assertEquals(ConnectionBackend.GATEWAY, backend)
    }

    @Test
    fun explicitHubStored_keepsHub() {
        val backend = ConnectionPrefsPolicy.backendFromStored(
            storedBackend = "hub",
            gatewayUrl = "wss://ignored:18789",
            hubAddress = "ws://10.0.2.2:8787",
            hubToken = "tok",
        )
        assertEquals(ConnectionBackend.HUB, backend)
    }

    @Test
    fun savedGateway_prefillsForm() {
        val form = connectionFormPrefill(
            backend = ConnectionBackend.GATEWAY,
            gatewayUrl = "wss://host:18789",
            gatewayToken = "tok",
            gatewayBootstrap = null,
            gatewayAgentId = "main",
            gatewaySessionKey = "agent:main:x",
            hubAddress = null,
            hubToken = null,
            deviceName = "OnePlus",
            fallbackDeviceName = "Android",
        )
        assertEquals("wss://host:18789", form.address)
        assertEquals("tok", form.token)
        assertEquals("main", form.agentId)
        assertEquals("OnePlus", form.deviceName)
        assertTrue(form.hasSavedConfig)
    }

    @Test
    fun disconnectDoesNotLookUnconfigured() {
        assertEquals(
            ConnectionState.Reconectando(0),
            ConnectionPrefsPolicy.effectiveConnectionState(
                ConnectionState.SinConfigurar,
                configured = true,
            ),
        )
        assertEquals(
            ConnectionState.SinConfigurar,
            ConnectionPrefsPolicy.effectiveConnectionState(
                ConnectionState.SinConfigurar,
                configured = false,
            ),
        )
        assertEquals(
            ConnectionState.Reconectando(5),
            ConnectionPrefsPolicy.effectiveConnectionState(
                ConnectionState.Reconectando(5),
                configured = true,
            ),
        )
    }

    @Test
    fun explicitHubIgnoresGatewayUrlForClient() {
        val config = ConnectionPrefsPolicy.toGatewayConfig(
            backend = ConnectionBackend.HUB,
            url = "wss://still-there:18789",
            token = "tok",
            bootstrap = null,
            agentId = null,
            sessionKey = null,
            deviceName = null,
        )
        assertNull(config)
    }
}
