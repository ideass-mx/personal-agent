package mx.ideass.personal.agent.gateway.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

class Ed25519DeviceCryptoTest {
    @Test
    fun deviceId_isSha256HexOfRawPublicKey() {
        val seed = ByteArray(32) { idx -> idx.toByte() }
        val identity = Ed25519DeviceCrypto.fromSeed(seed, createdAtMs = 0)
        val raw = java.util.Base64.getDecoder().decode(identity.publicKeyRawBase64)
        val expected = MessageDigest.getInstance("SHA-256").digest(raw)
            .joinToString("") { b -> "%02x".format(b) }
        assertEquals(expected, identity.deviceId)
        assertEquals(64, identity.deviceId.length)
    }

    @Test
    fun signAndVerify_roundTrip_knownPayload() {
        val seed = ByteArray(32) { 7 }
        val identity = Ed25519DeviceCrypto.fromSeed(seed)
        val payload = DeviceAuthPayload.buildV3(
            deviceId = identity.deviceId,
            clientId = "openclaw-android",
            clientMode = "ui",
            role = "operator",
            scopes = listOf("operator.read", "operator.write"),
            signedAtMs = 1_700_000_000_000,
            token = "tok-123",
            nonce = "nonce-abc",
            platform = "Android",
            deviceFamily = "Phone",
        )
        val signature = Ed25519DeviceCrypto.signPayload(payload, identity)
        assertTrue(signature.isNotBlank())
        assertFalse(signature.contains('+') || signature.contains('/') || signature.contains('='))
        assertTrue(Ed25519DeviceCrypto.verifyPayload(payload, signature, identity))
        assertFalse(
            Ed25519DeviceCrypto.verifyPayload(payload + "x", signature, identity),
        )
    }

    @Test
    fun fromSeed_isDeterministic() {
        val seed = ByteArray(32) { 1 }
        val a = Ed25519DeviceCrypto.fromSeed(seed, createdAtMs = 10)
        val b = Ed25519DeviceCrypto.fromSeed(seed, createdAtMs = 20)
        assertEquals(a.deviceId, b.deviceId)
        assertEquals(a.publicKeyRawBase64, b.publicKeyRawBase64)
        assertEquals(a.privateKeyPkcs8Base64, b.privateKeyPkcs8Base64)
    }
}
