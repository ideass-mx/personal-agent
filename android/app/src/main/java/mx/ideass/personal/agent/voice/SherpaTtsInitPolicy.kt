package mx.ideass.personal.agent.voice

/**
 * Decisión tras intentar cargar/iniciar OfflineTts.
 *
 * Por ahora el catálogo solo ofrece modelos **no cuantizados**: el AAR de
 * sherpa-onnx integrado no carga de forma fiable variantes int8/fp16.
 * Un fallo del runtime nativo (JNI / UnsatisfiedLinkError / etc.) debe
 * caer a Android TTS, nunca tumbar la app.
 */
enum class SherpaInitOutcome {
    Ready,
    FallbackAndroid,
}

object SherpaTtsInitPolicy {
    fun onInitResult(synthAvailable: Boolean): SherpaInitOutcome =
        if (synthAvailable) SherpaInitOutcome.Ready else SherpaInitOutcome.FallbackAndroid
}
