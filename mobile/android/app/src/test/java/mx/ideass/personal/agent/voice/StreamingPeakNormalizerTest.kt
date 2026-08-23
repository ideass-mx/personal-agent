package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class StreamingPeakNormalizerTest {

    @Test
    fun firstChunk_scalesToTargetPeak() {
        val norm = StreamingPeakNormalizer(targetPeak = 0.8f, maxGain = 4f)
        val out = norm.apply(floatArrayOf(0.2f, -0.2f))
        assertEquals(0.2f, norm.peakAbs, 1e-6f)
        assertEquals(0.8f, abs(out[0]), 1e-5f)
        assertEquals(0.8f, abs(out[1]), 1e-5f)
    }

    @Test
    fun laterLouderChunk_lowersGainForSubsequent() {
        val norm = StreamingPeakNormalizer(targetPeak = 0.8f, maxGain = 4f)
        norm.apply(floatArrayOf(0.2f))
        val loud = norm.apply(floatArrayOf(0.8f, -0.8f))
        assertEquals(0.8f, norm.peakAbs, 1e-6f)
        assertEquals(0.8f, abs(loud[0]), 1e-5f)
        assertEquals(1f, abs(loud[0]) / 0.8f, 1e-5f) // gain ≈ 1
    }

    @Test
    fun maxGain_capsBoostOnNearSilence() {
        val norm = StreamingPeakNormalizer(targetPeak = 0.9f, maxGain = 2f)
        val out = norm.apply(floatArrayOf(0.1f))
        assertEquals(0.2f, out[0], 1e-5f)
    }

    @Test
    fun empty_returnsEmpty() {
        val norm = StreamingPeakNormalizer()
        assertTrue(norm.apply(floatArrayOf()).isEmpty())
        assertEquals(0f, norm.peakAbs, 0f)
    }
}
