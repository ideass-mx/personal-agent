package mx.ideass.personal.agent.gateway.auth

import org.bouncycastle.asn1.DEROctetString
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.bouncycastle.crypto.util.PrivateKeyInfoFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Operaciones Ed25519 alineadas con `src/infra/device-identity.ts` del tag.
 *
 * Ed25519 no está disponible de forma fiable en Android Keystore con minSdk 29;
 * la clave se cifra en reposo con MasterKey (AES) del Keystore vía
 * EncryptedSharedPreferences (ver [DeviceIdentityStore]).
 */
object Ed25519DeviceCrypto {
    private val b64 = Base64.getEncoder().withoutPadding()
    private val b64Decoder = Base64.getDecoder()
    private val b64Url = Base64.getUrlEncoder().withoutPadding()
    private val b64UrlDecoder = Base64.getUrlDecoder()

    fun generate(random: SecureRandom = SecureRandom()): DeviceIdentity {
        val kpGen = Ed25519KeyPairGenerator()
        kpGen.init(Ed25519KeyGenerationParameters(random))
        val kp = kpGen.generateKeyPair()
        val pubKey = kp.public as Ed25519PublicKeyParameters
        val privKey = kp.private as Ed25519PrivateKeyParameters
        val rawPublic = pubKey.encoded
        val pkcs8Bytes = PrivateKeyInfoFactory.createPrivateKeyInfo(privKey).encoded
        return DeviceIdentity(
            deviceId = deviceIdFromPublicKeyRaw(rawPublic),
            publicKeyRawBase64 = b64.encodeToString(rawPublic),
            privateKeyPkcs8Base64 = b64.encodeToString(pkcs8Bytes),
            createdAtMs = System.currentTimeMillis(),
        )
    }

    /** Genera desde seed de 32 bytes (tests / vectores). */
    fun fromSeed(seed: ByteArray, createdAtMs: Long = 0L): DeviceIdentity {
        require(seed.size == 32) { "ed25519_seed_must_be_32_bytes" }
        val privKey = Ed25519PrivateKeyParameters(seed, 0)
        val pubKey = privKey.generatePublicKey()
        val rawPublic = pubKey.encoded
        val pkcs8Bytes = PrivateKeyInfoFactory.createPrivateKeyInfo(privKey).encoded
        return DeviceIdentity(
            deviceId = deviceIdFromPublicKeyRaw(rawPublic),
            publicKeyRawBase64 = b64.encodeToString(rawPublic),
            privateKeyPkcs8Base64 = b64.encodeToString(pkcs8Bytes),
            createdAtMs = createdAtMs,
        )
    }

    fun deviceIdFromPublicKeyRaw(rawPublic: ByteArray): String = sha256Hex(rawPublic)

    fun deviceIdFromPublicKeyRawBase64(publicKeyRawBase64: String): String {
        val raw = b64Decoder.decode(publicKeyRawBase64)
        return deviceIdFromPublicKeyRaw(raw)
    }

    fun publicKeyBase64Url(identity: DeviceIdentity): String {
        val raw = b64Decoder.decode(identity.publicKeyRawBase64)
        return b64Url.encodeToString(raw)
    }

    fun signPayload(payload: String, identity: DeviceIdentity): String {
        val privateKeyBytes = b64Decoder.decode(identity.privateKeyPkcs8Base64)
        val pkInfo = PrivateKeyInfo.getInstance(privateKeyBytes)
        val rawPrivate = DEROctetString.getInstance(pkInfo.parsePrivateKey()).octets
        val privateKey = Ed25519PrivateKeyParameters(rawPrivate, 0)
        val signer = Ed25519Signer()
        signer.init(true, privateKey)
        val payloadBytes = payload.toByteArray(Charsets.UTF_8)
        signer.update(payloadBytes, 0, payloadBytes.size)
        return b64Url.encodeToString(signer.generateSignature())
    }

    fun verifyPayload(
        payload: String,
        signatureBase64Url: String,
        identity: DeviceIdentity,
    ): Boolean {
        return try {
            val rawPublic = b64Decoder.decode(identity.publicKeyRawBase64)
            val pubKey = Ed25519PublicKeyParameters(rawPublic, 0)
            val sigBytes = base64UrlDecode(signatureBase64Url)
            val verifier = Ed25519Signer()
            verifier.init(false, pubKey)
            val payloadBytes = payload.toByteArray(Charsets.UTF_8)
            verifier.update(payloadBytes, 0, payloadBytes.size)
            verifier.verifySignature(sigBytes)
        } catch (_: Throwable) {
            false
        }
    }

    fun base64UrlDecode(input: String): ByteArray {
        val normalized = input.replace('-', '+').replace('_', '/')
        val padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
        return b64Decoder.decode(padded)
    }

    private fun sha256Hex(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(data)
        val out = CharArray(digest.size * 2)
        var i = 0
        for (byte in digest) {
            val v = byte.toInt() and 0xff
            out[i++] = HEX[v ushr 4]
            out[i++] = HEX[v and 0x0f]
        }
        return String(out)
    }

    private val HEX = "0123456789abcdef".toCharArray()
}
