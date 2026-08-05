package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sin

class StreamingPcmResamplerTest {

    @Test
    fun identityRate_passthrough() {
        val r = StreamingPcmResampler(16_000, 16_000)
        val input = shortArrayOf(1, 2, 3, 4)
        assertTrue(r.push(input).contentEquals(input))
    }

    @Test
    fun downsamples22050To16000_acrossChunks() {
        val srcRate = 22_050
        val dstRate = 16_000
        val r = StreamingPcmResampler(srcRate, dstRate)

        // Un segundo de seno a 440 Hz a 22050.
        val totalSrc = srcRate
        val src = ShortArray(totalSrc) { i ->
            (sin(2.0 * Math.PI * 440.0 * i / srcRate) * 16000).toInt().toShort()
        }

        val chunk = 2048
        val out = ArrayList<Short>()
        var offset = 0
        while (offset < src.size) {
            val end = (offset + chunk).coerceAtMost(src.size)
            out.addAll(r.push(src.copyOfRange(offset, end)).toList())
            offset = end
        }
        out.addAll(r.flush().toList())

        val expected = (totalSrc.toLong() * dstRate / srcRate).toInt()
        // Tolerancia por borde fraccional.
        assertTrue(
            "out=${out.size} expected≈$expected",
            abs(out.size - expected) <= 4,
        )
        // Señal no nula.
        assertTrue(out.any { abs(it.toInt()) > 100 })
    }

    @Test
    fun floatToPcm16_clamps() {
        val pcm = PcmFloat.toPcm16(floatArrayOf(-2f, -1f, 0f, 1f, 2f))
        assertEquals(-32767, pcm[0].toInt())
        assertEquals(-32767, pcm[1].toInt())
        assertEquals(0, pcm[2].toInt())
        assertEquals(32767, pcm[3].toInt())
        assertEquals(32767, pcm[4].toInt())
    }
}
