package mx.ideass.personal.agent.gateway.auth

import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.GatewayClientId
import mx.ideass.personal.agent.gateway.protocol.GatewayClientMode
import mx.ideass.personal.agent.gateway.protocol.GatewayRoles
import mx.ideass.personal.agent.gateway.protocol.OperatorScopes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SignedConnectParamsFactoryTest {
    @Test
    fun create_signsV3Payload_fieldByField() {
        val secure = InMemorySecureStringStore()
        val seed = ByteArray(32) { 3 }
        val identity = Ed25519DeviceCrypto.fromSeed(seed, createdAtMs = 1)
        secure.putString(
            "identity.v1",
            kotlinx.serialization.json.Json.encodeToString(
                DeviceIdentity.serializer(),
                identity,
            ),
        )
        val identityStore2 = DeviceIdentityStore(secure)
        val tokenStore = DeviceTokenStore(InMemorySecureStringStore())
        tokenStore.saveToken(
            gatewayId = "gw-1",
            deviceId = identity.deviceId,
            role = GatewayRoles.OPERATOR,
            token = "device-tok",
            scopes = OperatorScopes.CHAT_MINIMAL,
        )

        val config = GatewayConfig(
            url = "wss://example:18789",
            gatewayStableId = "gw-1",
            sharedToken = "gateway-tok",
            platform = "  Android  ",
            deviceFamily = "  Phone  ",
            clientVersion = "0.1.0",
        )
        val factory = SignedConnectParamsFactory(
            identityStore = identityStore2,
            tokenStore = tokenStore,
            config = config,
            clockMs = { 1_700_000_000_000L },
        )

        val params = factory.create("nonce-xyz")
        val device = requireNotNull(params.device)
        assertEquals(identity.deviceId, device.id)
        assertEquals("nonce-xyz", device.nonce)
        assertEquals(1_700_000_000_000L, device.signedAt)
        assertEquals(GatewayClientId.OPENCLAW_ANDROID, params.client.id)
        assertEquals(GatewayClientMode.UI, params.client.mode)
        assertEquals(GatewayRoles.OPERATOR, params.role)
        assertEquals("gateway-tok", params.auth?.token)
        assertEquals("device-tok", params.auth?.deviceToken)

        val expectedPayload = DeviceAuthPayload.buildV3(
            deviceId = identity.deviceId,
            clientId = "openclaw-android",
            clientMode = "ui",
            role = "operator",
            scopes = OperatorScopes.CHAT_MINIMAL,
            signedAtMs = 1_700_000_000_000L,
            token = "gateway-tok",
            nonce = "nonce-xyz",
            platform = "  Android  ",
            deviceFamily = "  Phone  ",
        )
        assertTrue(
            Ed25519DeviceCrypto.verifyPayload(expectedPayload, device.signature, identity),
        )
        // platform en client.info se envía sin normalizar; la firma sí normaliza.
        assertEquals("  Android  ", params.client.platform)
    }

    @Test
    fun create_usesBootstrapTokenInSignatureWhenNoSharedToken() {
        val secure = InMemorySecureStringStore()
        val identity = Ed25519DeviceCrypto.fromSeed(ByteArray(32) { 9 })
        secure.putString(
            "identity.v1",
            kotlinx.serialization.json.Json.encodeToString(DeviceIdentity.serializer(), identity),
        )
        val factory = SignedConnectParamsFactory(
            identityStore = DeviceIdentityStore(secure),
            tokenStore = DeviceTokenStore(InMemorySecureStringStore()),
            config = GatewayConfig(
                url = "wss://example",
                gatewayStableId = "g",
                bootstrapToken = "boot-1",
            ),
            clockMs = { 42L },
        )
        val params = factory.create("n1")
        val expected = DeviceAuthPayload.buildV3(
            deviceId = identity.deviceId,
            clientId = "openclaw-android",
            clientMode = "ui",
            role = "operator",
            scopes = OperatorScopes.CHAT_MINIMAL,
            signedAtMs = 42L,
            token = "boot-1",
            nonce = "n1",
            platform = "android",
            deviceFamily = null,
        )
        assertTrue(
            Ed25519DeviceCrypto.verifyPayload(
                expected,
                requireNotNull(params.device).signature,
                identity,
            ),
        )
        assertEquals("boot-1", params.auth?.bootstrapToken)
    }
}
