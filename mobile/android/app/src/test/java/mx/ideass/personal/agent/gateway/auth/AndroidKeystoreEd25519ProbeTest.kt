package mx.ideass.personal.agent.gateway.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PHASE 57.11-A — conclusión de producto (JVM, sin AndroidKeyStore provider).
 */
class AndroidKeystoreEd25519ProbeTest {

    @Test
    fun productMinSdk29_cannotRequireNativeKeystoreEd25519() {
        assertEquals(29, AndroidKeystoreEd25519Validation.MIN_SDK_PRODUCT)
        assertEquals(
            AndroidKeystoreEd25519Validation.Verdict.NOT_SUPPORTED,
            AndroidKeystoreEd25519Validation.productConclusionForMinSdk29(),
        )
        assertTrue(
            AndroidKeystoreEd25519Validation.DOCUMENTED_KEYSTORE_ED25519_API_FLOOR >= 33,
        )
    }

    @Test
    fun existingSoftwareEd25519_stillWorks_forProtocol() {
        val identity = Ed25519DeviceCrypto.generate()
        val spki = Ed25519DeviceCrypto.publicKeySpkiBase64(identity)
        assertTrue(spki.isNotBlank())
        val payload = "PersonalAgent\nDeviceAuth\n1\ndev\n" + "ab".repeat(32)
        val sig = Ed25519DeviceCrypto.signPayload(payload, identity)
        assertTrue(Ed25519DeviceCrypto.verifyPayload(payload, sig, identity))
    }
}
