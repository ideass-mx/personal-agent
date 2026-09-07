package mx.ideass.personal.agent.gateway.auth

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * PHASE 57.11-A — Validación técnica aislada.
 *
 * Intenta generate / getPublicKey(SPKI) / sign con Android Keystore + Ed25519.
 * No es el DeviceKeyStore de producto. No cambia pairing ni protocolo.
 *
 * Resultado esperado en minSdk 29: el provider no ofrece Ed25519 de forma
 * utilizable en todo el rango de dispositivos del producto.
 */
object AndroidKeystoreEd25519Probe {

    enum class StepStatus {
        OK,
        FAILED,
        SKIPPED,
    }

    data class StepResult(
        val status: StepStatus,
        val detail: String,
    )

    data class ProbeReport(
        val sdkInt: Int,
        val minSdkProduct: Int,
        val generation: StepResult,
        val publicKeySpki: StepResult,
        val sign: StepResult,
        val verifyExistingEd25519: StepResult,
        val verdict: AndroidKeystoreEd25519Validation.Verdict,
        val notes: List<String>,
    )

    private const val ALIAS = "pa_probe_ed25519_5711a"

    const val DOCUMENTED_KEYSTORE_ED25519_API_FLOOR: Int =
        AndroidKeystoreEd25519Validation.DOCUMENTED_KEYSTORE_ED25519_API_FLOOR

    fun productConclusionForMinSdk29(): AndroidKeystoreEd25519Validation.Verdict =
        AndroidKeystoreEd25519Validation.productConclusionForMinSdk29()

    fun run(): ProbeReport {
        val notes = mutableListOf<String>()
        val minSdk = AndroidKeystoreEd25519Validation.MIN_SDK_PRODUCT
        notes.add(
            "Producto minSdk=$minSdk. CTS Keystore Ed25519 gate ≈ API $DOCUMENTED_KEYSTORE_ED25519_API_FLOOR (Android V).",
        )
        notes.add(
            "NamedParameterSpec.ED25519 aparece en API 33; no implica Keystore utilizable en API 29–32.",
        )
        notes.add("StrongBox no es requisito de producto.")

        if (Build.VERSION.SDK_INT < DOCUMENTED_KEYSTORE_ED25519_API_FLOOR) {
            notes.add(
                "SDK_INT=${Build.VERSION.SDK_INT} < $DOCUMENTED_KEYSTORE_ED25519_API_FLOOR → no se espera soporte Keystore Ed25519.",
            )
        }

        deleteAliasQuietly()

        val generation = tryGenerate()
        if (generation.status != StepStatus.OK) {
            return ProbeReport(
                sdkInt = Build.VERSION.SDK_INT,
                minSdkProduct = minSdk,
                generation = generation,
                publicKeySpki = StepResult(StepStatus.SKIPPED, "sin clave"),
                sign = StepResult(StepStatus.SKIPPED, "sin clave"),
                verifyExistingEd25519 = StepResult(StepStatus.SKIPPED, "sin firma"),
                verdict = verdictFor(allOk = false),
                notes = notes,
            )
        }

        val publicKeySpki = tryExportSpki()
        val sign = trySign()
        val verify =
            if (sign.status == StepStatus.OK && publicKeySpki.status == StepStatus.OK) {
                tryVerifyWithBouncyCastle(
                    spkiBase64 = publicKeySpki.detail.removePrefix("spki:"),
                    signatureBase64 = sign.detail.removePrefix("sig:"),
                )
            } else {
                StepResult(StepStatus.SKIPPED, "falta SPKI o firma")
            }

        val allOk =
            generation.status == StepStatus.OK &&
                publicKeySpki.status == StepStatus.OK &&
                sign.status == StepStatus.OK &&
                verify.status == StepStatus.OK

        deleteAliasQuietly()

        return ProbeReport(
            sdkInt = Build.VERSION.SDK_INT,
            minSdkProduct = minSdk,
            generation = generation,
            publicKeySpki = publicKeySpki,
            sign = sign,
            verifyExistingEd25519 = verify,
            verdict = verdictFor(allOk = allOk),
            notes = notes,
        )
    }

    private fun verdictFor(allOk: Boolean): AndroidKeystoreEd25519Validation.Verdict {
        // Nunca SUPPORTED como floor de producto minSdk 29.
        if (allOk && Build.VERSION.SDK_INT >= DOCUMENTED_KEYSTORE_ED25519_API_FLOOR) {
            return AndroidKeystoreEd25519Validation.Verdict.CONDITIONAL
        }
        return AndroidKeystoreEd25519Validation.Verdict.NOT_SUPPORTED
    }

    private fun tryGenerate(): StepResult {
        return try {
            // Path A: algorithm "Ed25519" (AOSP KeyPairGenerator.Ed25519)
            try {
                val kpg = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
                val spec =
                    KeyGenParameterSpec.Builder(
                        ALIAS,
                        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                    )
                        .setDigests(KeyProperties.DIGEST_NONE)
                        .build()
                kpg.initialize(spec)
                kpg.generateKeyPair()
                return StepResult(StepStatus.OK, "KeyPairGenerator(Ed25519, AndroidKeyStore)")
            } catch (first: Exception) {
                // Path B: EC + ECGenParameterSpec("ed25519") (CTS Curve25519Test style)
                val kpg = KeyPairGenerator.getInstance("EC", "AndroidKeyStore")
                val spec =
                    KeyGenParameterSpec.Builder(
                        ALIAS,
                        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                    )
                        .setAlgorithmParameterSpec(ECGenParameterSpec("ed25519"))
                        .setDigests(KeyProperties.DIGEST_NONE)
                        .build()
                kpg.initialize(spec)
                kpg.generateKeyPair()
                StepResult(
                    StepStatus.OK,
                    "KeyPairGenerator(EC, AndroidKeyStore)+ECGenParameterSpec(ed25519); fallback after: ${first.javaClass.simpleName}",
                )
            }
        } catch (e: Exception) {
            StepResult(
                StepStatus.FAILED,
                "${e.javaClass.simpleName}: ${sanitize(e.message)}",
            )
        }
    }

    private fun tryExportSpki(): StepResult {
        return try {
            val ks = KeyStore.getInstance("AndroidKeyStore")
            ks.load(null)
            val cert = ks.getCertificate(ALIAS)
                ?: return StepResult(StepStatus.FAILED, "certificate null")
            val encoded = cert.publicKey.encoded
                ?: return StepResult(StepStatus.FAILED, "publicKey.encoded null")
            val spki = Base64.getEncoder().encodeToString(encoded)
            if (!looksLikeEd25519Spki(encoded)) {
                return StepResult(
                    StepStatus.FAILED,
                    "encoded public key no parece SPKI Ed25519 (len=${encoded.size})",
                )
            }
            StepResult(StepStatus.OK, "spki:$spki")
        } catch (e: Exception) {
            StepResult(StepStatus.FAILED, "${e.javaClass.simpleName}: ${sanitize(e.message)}")
        }
    }

    private fun trySign(): StepResult {
        return try {
            val ks = KeyStore.getInstance("AndroidKeyStore")
            ks.load(null)
            val privateKey = ks.getKey(ALIAS, null)
                ?: return StepResult(StepStatus.FAILED, "private key entry null")
            // Private key handle only — never export encoded private material.
            if (privateKey.encoded != null) {
                return StepResult(
                    StepStatus.FAILED,
                    "privateKey.encoded no es null (material exportable — no aceptable)",
                )
            }
            val challenge = ByteArray(32) { (it + 3).toByte() }
            val signer = Signature.getInstance("Ed25519")
            signer.initSign(privateKey as java.security.PrivateKey)
            signer.update(challenge)
            val sig = signer.sign()
            if (sig.size != 64) {
                return StepResult(StepStatus.FAILED, "signature len=${sig.size}, esperado 64")
            }
            StepResult(StepStatus.OK, "sig:" + Base64.getEncoder().encodeToString(sig))
        } catch (e: Exception) {
            StepResult(StepStatus.FAILED, "${e.javaClass.simpleName}: ${sanitize(e.message)}")
        }
    }

    private fun tryVerifyWithBouncyCastle(
        spkiBase64: String,
        signatureBase64: String,
    ): StepResult {
        return try {
            val spki = Base64.getDecoder().decode(spkiBase64)
            val raw = ed25519RawFromSpki(spki)
            val challenge = ByteArray(32) { (it + 3).toByte() }
            val pub = org.bouncycastle.crypto.params.Ed25519PublicKeyParameters(raw, 0)
            val verifier = org.bouncycastle.crypto.signers.Ed25519Signer()
            verifier.init(false, pub)
            verifier.update(challenge, 0, challenge.size)
            val ok = verifier.verifySignature(Base64.getDecoder().decode(signatureBase64))
            if (ok) {
                StepResult(StepStatus.OK, "BouncyCastle Ed25519Signer verify=true")
            } else {
                StepResult(StepStatus.FAILED, "BouncyCastle verify=false")
            }
        } catch (e: Exception) {
            StepResult(StepStatus.FAILED, "${e.javaClass.simpleName}: ${sanitize(e.message)}")
        }
    }

    /** Ed25519 SPKI: 12-byte DER prefix + 32-byte raw key. */
    private fun looksLikeEd25519Spki(encoded: ByteArray): Boolean {
        if (encoded.size < 44) return false
        // 30 2a 30 05 06 03 2b 65 70 03 21 00
        val prefix =
            byteArrayOf(
                0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
            )
        return encoded.size == 44 && encoded.copyOfRange(0, 12).contentEquals(prefix)
    }

    private fun ed25519RawFromSpki(spki: ByteArray): ByteArray {
        require(looksLikeEd25519Spki(spki)) { "not_ed25519_spki" }
        return spki.copyOfRange(12, 44)
    }

    private fun deleteAliasQuietly() {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore")
            ks.load(null)
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
        } catch (_: Exception) {
            /* probe cleanup */
        }
    }

    private fun sanitize(message: String?): String {
        val m = message?.trim().orEmpty()
        if (m.isEmpty()) return "(no message)"
        // Never echo key material if a provider ever embeds it.
        return m.take(180).replace(Regex("(?i)key[=:].{8,}"), "key=(redacted)")
    }
}
