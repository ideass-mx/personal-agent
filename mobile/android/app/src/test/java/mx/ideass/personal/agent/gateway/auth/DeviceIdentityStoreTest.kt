package mx.ideass.personal.agent.gateway.auth

import kotlinx.serialization.json.Json
import mx.ideass.personal.agent.protocol.ClientMessage
import mx.ideass.personal.agent.protocol.ProtocolJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DeviceIdentityStoreTest {

    @Test
    fun firstInit_createsStableIdentity() {
        val store = DeviceIdentityStore(InMemorySecureStringStore())
        val identity = store.loadOrCreate()
        assertTrue(identity.deviceId.isNotBlank())
        assertTrue(identity.publicKeyRawBase64.isNotBlank())
        assertTrue(identity.privateKeyPkcs8Base64.isNotBlank())
        assertTrue(Ed25519DeviceCrypto.keyPairMatches(identity))
    }

    @Test
    fun persistence_sameIdentityAcrossStoreInstances() {
        val mem = InMemorySecureStringStore()
        val first = DeviceIdentityStore(mem).loadOrCreate()
        val second = DeviceIdentityStore(mem).loadOrCreate()
        assertEquals(first.deviceId, second.deviceId)
        assertEquals(first.publicKeyRawBase64, second.publicKeyRawBase64)
        assertEquals(first.privateKeyPkcs8Base64, second.privateKeyPkcs8Base64)
    }

    @Test
    fun signAndVerify_roundTrip() {
        val store = DeviceIdentityStore(InMemorySecureStringStore())
        val identity = store.loadOrCreate()
        val payload = "challenge-payload"
        val sig = store.signPayload(payload, identity)
        assertTrue(Ed25519DeviceCrypto.verifyPayload(payload, sig, identity))
    }

    @Test
    fun wrongIdentity_signatureFails() {
        val a = DeviceIdentityStore(InMemorySecureStringStore()).loadOrCreate()
        val b = DeviceIdentityStore(InMemorySecureStringStore()).loadOrCreate()
        assertNotEquals(a.deviceId, b.deviceId)
        val sig = Ed25519DeviceCrypto.signPayload("msg", a)
        assertFalse(Ed25519DeviceCrypto.verifyPayload("msg", sig, b))
    }

    @Test
    fun corruptStorage_doesNotSilentlyRegenerate() {
        val mem = InMemorySecureStringStore()
        val store = DeviceIdentityStore(mem)
        val original = store.loadOrCreate()
        mem.putString("identity.v1", "{not-json")
        try {
            DeviceIdentityStore(mem).loadOrCreate()
            fail("expected device_identity_corrupt")
        } catch (e: IllegalStateException) {
            assertEquals("device_identity_corrupt", e.message)
        }
        // Original blob was overwritten in this test; ensure we did not create a new valid identity.
        val raw = mem.getString("identity.v1")
        assertEquals("{not-json", raw)
        assertTrue(original.deviceId.isNotBlank())
    }

    @Test
    fun keypairMismatch_doesNotSilentlyRegenerate() {
        val mem = InMemorySecureStringStore()
        val store = DeviceIdentityStore(mem)
        val original = store.loadOrCreate()
        val other = Ed25519DeviceCrypto.generate()
        val mismatched = original.copy(privateKeyPkcs8Base64 = other.privateKeyPkcs8Base64)
        mem.putString(
            "identity.v1",
            Json.encodeToString(DeviceIdentity.serializer(), mismatched),
        )
        try {
            DeviceIdentityStore(mem).loadOrCreate()
            fail("expected device_identity_keypair_mismatch")
        } catch (e: IllegalStateException) {
            assertEquals("device_identity_keypair_mismatch", e.message)
        }
    }

    @Test
    fun pairingRequest_wireJson_hasPublicKey_notPrivateKey() {
        val identity = Ed25519DeviceCrypto.generate()
        val req = ClientMessage.PairingRequest(
            pairingSessionId = "sess",
            pairingSecret = "secret",
            deviceId = identity.deviceId,
            deviceName = "Pixel",
            platform = "android",
            publicKey = Ed25519DeviceCrypto.publicKeySpkiBase64(identity),
            keyAlgorithm = "Ed25519",
        )
        val wire = ProtocolJson.encodeToString(ClientMessage.serializer(), req)
        assertTrue(wire.contains("\"publicKey\""))
        assertTrue(wire.contains("\"keyAlgorithm\""))
        assertFalse(wire.contains("privateKey"))
        assertFalse(wire.contains(identity.privateKeyPkcs8Base64))
    }
}
