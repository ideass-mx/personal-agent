package mx.ideass.personal.agent.voice

import kotlin.math.abs

/**
 * PCM float [-1, 1] → PCM 16-bit.
 */
object PcmFloat {
    fun toPcm16(samples: FloatArray): ShortArray {
        val out = ShortArray(samples.size)
        for (i in samples.indices) {
            val s = samples[i].coerceIn(-1f, 1f)
            out[i] = (s * 32767f).toInt().toShort()
        }
        return out
    }

    fun peakAbs(samples: FloatArray): Float {
        var peak = 0f
        for (s in samples) {
            val a = abs(s)
            if (a > peak) peak = a
        }
        return peak
    }
}

/**
 * Remuestreo lineal continuo entre chunks (p. ej. 22_050 → 16_000).
 *
 * Mantiene un buffer fuente pendiente y posición fraccional para no romper
 * la continuidad al hacer streaming.
 */
class StreamingPcmResampler(
    private val srcRateHz: Int,
    private val dstRateHz: Int,
) {
    init {
        require(srcRateHz > 0 && dstRateHz > 0)
    }

    private var pending = ShortArray(0)
    /** Índice fraccional dentro de [pending]. */
    private var readPos = 0.0

    fun push(input: ShortArray): ShortArray {
        if (srcRateHz == dstRateHz) return input.copyOf()
        if (input.isEmpty()) return ShortArray(0)

        pending = concat(pending, input)
        val step = srcRateHz.toDouble() / dstRateHz.toDouble()
        val out = ArrayList<Short>(((input.size.toLong() * dstRateHz) / srcRateHz).toInt() + 2)

        while (readPos + 1.0 < pending.size) {
            val i0 = readPos.toInt()
            val frac = (readPos - i0).toFloat()
            val s0 = pending[i0].toInt()
            val s1 = pending[i0 + 1].toInt()
            val sample = (s0 * (1f - frac) + s1 * frac).toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
            out.add(sample.toShort())
            readPos += step
        }

        compactPending()
        return out.toShortArray()
    }

    /** Emite lo que quede con hold del último sample (fin de utterance). */
    fun flush(): ShortArray {
        if (srcRateHz == dstRateHz || pending.isEmpty()) {
            pending = ShortArray(0)
            readPos = 0.0
            return ShortArray(0)
        }
        val step = srcRateHz.toDouble() / dstRateHz.toDouble()
        val out = ArrayList<Short>(4)
        val last = pending.last()
        while (readPos < pending.size) {
            val i0 = readPos.toInt().coerceAtMost(pending.lastIndex)
            val i1 = (i0 + 1).coerceAtMost(pending.lastIndex)
            val frac = (readPos - i0).toFloat().coerceIn(0f, 1f)
            val s0 = pending[i0].toInt()
            val s1 = if (i1 == i0) last.toInt() else pending[i1].toInt()
            val sample = (s0 * (1f - frac) + s1 * frac).toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
            out.add(sample.toShort())
            readPos += step
            if (out.size > pending.size * 4 + 8) break
        }
        pending = ShortArray(0)
        readPos = 0.0
        return out.toShortArray()
    }

    private fun compactPending() {
        val drop = readPos.toInt().coerceAtLeast(0)
        if (drop <= 0) return
        if (drop >= pending.size) {
            pending = ShortArray(0)
            readPos = 0.0
            return
        }
        pending = pending.copyOfRange(drop, pending.size)
        readPos -= drop
    }

    private fun concat(a: ShortArray, b: ShortArray): ShortArray {
        if (a.isEmpty()) return b.copyOf()
        if (b.isEmpty()) return a
        return ShortArray(a.size + b.size).also {
            a.copyInto(it)
            b.copyInto(it, destinationOffset = a.size)
        }
    }
}
