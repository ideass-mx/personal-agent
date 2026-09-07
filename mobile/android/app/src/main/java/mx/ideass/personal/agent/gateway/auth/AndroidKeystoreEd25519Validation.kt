package mx.ideass.personal.agent.gateway.auth

/**
 * PHASE 57.11-A — conclusiones de producto (sin APIs Android).
 * Usable en unit tests JVM.
 */
object AndroidKeystoreEd25519Validation {

    enum class Verdict {
        SUPPORTED,
        NOT_SUPPORTED,
        CONDITIONAL,
    }

    /** Floor del producto (`build.gradle.kts`). */
    const val MIN_SDK_PRODUCT: Int = 29

    /**
     * Floor documentado por CTS (`Curve25519Test`: soporte esperado desde
     * Android V preview ≈ API 35) para generación Ed25519 en AndroidKeyStore.
     */
    const val DOCUMENTED_KEYSTORE_ED25519_API_FLOOR: Int = 35

    /**
     * Con minSdk 29 no podemos exigir Android Keystore Ed25519 nativo
     * para todo el parque de dispositivos.
     */
    fun productConclusionForMinSdk29(): Verdict = Verdict.NOT_SUPPORTED
}
