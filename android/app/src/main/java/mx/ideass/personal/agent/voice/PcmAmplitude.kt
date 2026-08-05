package mx.ideass.personal.agent.voice

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Métricas de amplitud de un buffer PCM (float [-1, 1] o int16 escalado).
 *
 * dBFS = 20·log10(peak) respecto a full-scale digital (1.0).
 */
data class PcmAmplitude(
    val peak: Float,
    val rms: Float,
    val sampleCount: Int,
) {
    val peakDbFs: Float get() = toDbFs(peak)
    val rmsDbFs: Float get() = toDbFs(rms)

    fun summary(): String =
        "peak=%.4f (%.1f dBFS) rms=%.4f (%.1f dBFS) n=%d".format(
            peak,
            peakDbFs,
            rms,
            rmsDbFs,
            sampleCount,
        )

    companion object {
        const val SILENCE_DBFS = -96f

        fun toDbFs(linear: Float): Float {
            if (linear <= 0f) return SILENCE_DBFS
            return (20.0 * log10(linear.toDouble())).toFloat()
        }

        /** Mide PCM float mono en [-1, 1]. */
        fun measure(samples: FloatArray): PcmAmplitude {
            if (samples.isEmpty()) return PcmAmplitude(0f, 0f, 0)
            var peak = 0f
            var sumSq = 0.0
            for (s in samples) {
                val a = abs(s)
                if (a > peak) peak = a
                sumSq += s.toDouble() * s.toDouble()
            }
            val rms = sqrt(sumSq / samples.size).toFloat()
            return PcmAmplitude(peak = peak, rms = rms, sampleCount = samples.size)
        }

        /**
         * Mide PCM 16-bit mono escalando a float con ÷32767
         * (mismo factor que [PcmFloat.toPcm16]).
         */
        fun measure(samples: ShortArray): PcmAmplitude {
            if (samples.isEmpty()) return PcmAmplitude(0f, 0f, 0)
            var peak = 0f
            var sumSq = 0.0
            for (s in samples) {
                val f = s.toFloat() / 32767f
                val a = abs(f)
                if (a > peak) peak = a
                sumSq += f.toDouble() * f.toDouble()
            }
            val rms = sqrt(sumSq / samples.size).toFloat()
            return PcmAmplitude(peak = peak, rms = rms, sampleCount = samples.size)
        }
    }
}

/**
 * Recorre las etapas del pipeline TTS (float → int16 → resample) y reporta
 * amplitud en cada una. Testeable sin JNI / AudioTrack.
 */
object PcmPipelineProbe {
    data class StageReport(
        val sherpaFloat: PcmAmplitude,
        val afterInt16: PcmAmplitude,
        val afterResample: PcmAmplitude?,
        val srcRateHz: Int,
        val dstRateHz: Int?,
    ) {
        fun lines(): List<String> = buildList {
            add("1) sherpa float: ${sherpaFloat.summary()}")
            add("2) after float→int16: ${afterInt16.summary()}")
            if (afterResample != null && dstRateHz != null) {
                add("3) after resample $srcRateHz→$dstRateHz: ${afterResample.summary()}")
            } else {
                add("3) resample: (omitido, mismo rate)")
            }
        }
    }

    fun measureStages(
        floats: FloatArray,
        srcRateHz: Int,
        dstRateHz: Int? = null,
    ): StageReport {
        val floatAmp = PcmAmplitude.measure(floats)
        val pcm = PcmFloat.toPcm16(floats)
        val int16Amp = PcmAmplitude.measure(pcm)
        val afterResample = if (dstRateHz != null && dstRateHz > 0 && dstRateHz != srcRateHz) {
            PcmAmplitude.measure(resampleAll(pcm, srcRateHz, dstRateHz))
        } else {
            null
        }
        return StageReport(
            sherpaFloat = floatAmp,
            afterInt16 = int16Amp,
            afterResample = afterResample,
            srcRateHz = srcRateHz,
            dstRateHz = dstRateHz,
        )
    }

    private fun resampleAll(pcm: ShortArray, srcRateHz: Int, dstRateHz: Int): ShortArray {
        val r = StreamingPcmResampler(srcRateHz, dstRateHz)
        val chunk = 2048
        val acc = ArrayList<Short>(pcm.size)
        var offset = 0
        while (offset < pcm.size) {
            val end = (offset + chunk).coerceAtMost(pcm.size)
            for (s in r.push(pcm.copyOfRange(offset, end))) acc.add(s)
            offset = end
        }
        for (s in r.flush()) acc.add(s)
        return acc.toShortArray()
    }
}
