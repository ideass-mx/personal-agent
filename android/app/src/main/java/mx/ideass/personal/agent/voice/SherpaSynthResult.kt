package mx.ideass.personal.agent.voice

/**
 * Resultado de una síntesis con [SherpaOfflineSynthesizer].
 *
 * [samples] es PCM float mono en [-1, 1] (concatenación de todos los chunks).
 */
data class SherpaSynthResult(
    val samples: FloatArray,
    val sampleRateHz: Int,
    val chunkCount: Int,
) {
    val durationSeconds: Double =
        if (sampleRateHz <= 0) 0.0 else samples.size.toDouble() / sampleRateHz.toDouble()

    fun hasAudibleSignal(minPeak: Float = 0.01f): Boolean {
        var peak = 0f
        for (s in samples) {
            val a = kotlin.math.abs(s)
            if (a > peak) peak = a
        }
        return peak >= minPeak
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is SherpaSynthResult) return false
        return sampleRateHz == other.sampleRateHz &&
            chunkCount == other.chunkCount &&
            samples.contentEquals(other.samples)
    }

    override fun hashCode(): Int {
        var result = samples.contentHashCode()
        result = 31 * result + sampleRateHz
        result = 31 * result + chunkCount
        return result
    }
}

/**
 * Acumula chunks de [OfflineTts.generateWithCallback] y calcula métricas.
 * Testeable sin JNI.
 */
class SherpaSynthChunkAccumulator {
    private val chunks = ArrayList<FloatArray>()
    private var totalSamples = 0
    private var stoppedEarly = false

    val chunkCount: Int get() = chunks.size
    val wasStoppedEarly: Boolean get() = stoppedEarly

    /**
     * @return 1 para continuar, 0 para parar (contrato sherpa-onnx).
     */
    fun onChunk(samples: FloatArray, continueGeneration: Boolean = true): Int {
        if (samples.isNotEmpty()) {
            chunks.add(samples.copyOf())
            totalSamples += samples.size
        }
        if (!continueGeneration) {
            stoppedEarly = true
            return 0
        }
        return 1
    }

    fun build(sampleRateHz: Int): SherpaSynthResult {
        val merged = FloatArray(totalSamples)
        var offset = 0
        for (chunk in chunks) {
            chunk.copyInto(merged, destinationOffset = offset)
            offset += chunk.size
        }
        return SherpaSynthResult(
            samples = merged,
            sampleRateHz = sampleRateHz,
            chunkCount = chunks.size,
        )
    }
}
