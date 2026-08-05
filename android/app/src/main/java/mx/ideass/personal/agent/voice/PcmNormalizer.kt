package mx.ideass.personal.agent.voice

/**
 * Normalización de pico de PCM float antes de float→int16.
 *
 * Escala la frase completa a [targetPeak] (p. ej. ~0.89 ≈ −1 dBFS) con
 * clamp a ±1.0. Idempotente: una segunda pasada deja gain ≈ 1.
 *
 * [maxGain] evita amplificar ruido en frases casi silenciosas.
 */
object PcmNormalizer {
    const val DEFAULT_TARGET_PEAK = 0.89125f // 10^(-1/20) ≈ −1 dBFS
    const val DEFAULT_MAX_GAIN = 4f
    private const val MIN_PEAK = 1e-6f

    /**
     * @return nuevo buffer normalizado (no muta [samples]).
     */
    fun normalizePeak(
        samples: FloatArray,
        targetPeak: Float = DEFAULT_TARGET_PEAK,
        maxGain: Float = DEFAULT_MAX_GAIN,
    ): FloatArray {
        require(targetPeak > 0f && targetPeak <= 1f) {
            "targetPeak debe estar en (0, 1], got=$targetPeak"
        }
        require(maxGain >= 1f) { "maxGain debe ser ≥ 1, got=$maxGain" }
        if (samples.isEmpty()) return FloatArray(0)

        val peak = PcmFloat.peakAbs(samples)
        if (peak < MIN_PEAK) return samples.copyOf()

        val gain = (targetPeak / peak).coerceAtMost(maxGain)
        if (gain == 1f) return samples.copyOf()

        return FloatArray(samples.size) { i ->
            (samples[i] * gain).coerceIn(-1f, 1f)
        }
    }
}
