package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sin

class PcmAmplitudeTest {

    @Test
    fun measure_fullScaleSine_peakNearOne() {
        val n = 8000
        val samples = FloatArray(n) { i ->
            sin(2.0 * Math.PI * 440.0 * i / 16_000).toFloat()
        }
        val amp = PcmAmplitude.measure(samples)
        assertEquals(1f, amp.peak, 1e-5f)
        // RMS de seno full-scale = 1/√2 ≈ 0.707
        assertEquals(0.7071f, amp.rms, 0.01f)
        assertEquals(0f, amp.peakDbFs, 0.01f)
        assertEquals(-3.01f, amp.rmsDbFs, 0.05f)
    }

    @Test
    fun measure_halfScale_peakDbFsAboutMinus6() {
        val samples = FloatArray(1000) { 0.5f }
        val amp = PcmAmplitude.measure(samples)
        assertEquals(0.5f, amp.peak, 1e-6f)
        assertEquals(0.5f, amp.rms, 1e-6f)
        assertEquals(-6.02f, amp.peakDbFs, 0.05f)
    }

    @Test
    fun measure_int16_matchesFloatScale() {
        val floats = floatArrayOf(-1f, -0.5f, 0f, 0.5f, 1f)
        val pcm = PcmFloat.toPcm16(floats)
        val fromFloat = PcmAmplitude.measure(floats)
        val fromShort = PcmAmplitude.measure(pcm)
        assertEquals(fromFloat.peak, fromShort.peak, 1e-4f)
        assertEquals(fromFloat.rms, fromShort.rms, 1e-4f)
    }

    @Test
    fun toDbFs_silence() {
        assertEquals(PcmAmplitude.SILENCE_DBFS, PcmAmplitude.toDbFs(0f), 0f)
    }

    @Test
    fun empty_zeros() {
        val amp = PcmAmplitude.measure(FloatArray(0))
        assertEquals(0, amp.sampleCount)
        assertEquals(0f, amp.peak, 0f)
    }
}

class PcmNormalizerTest {

    @Test
    fun normalize_lowPeak_reachesTarget() {
        // Pico típico Piper medido ≈ 0.42 (−7.5 dBFS)
        val n = 4000
        val peakIn = 0.4215f
        val samples = FloatArray(n) { i ->
            (sin(2.0 * Math.PI * 220.0 * i / 22_050) * peakIn).toFloat()
        }
        val target = PcmNormalizer.DEFAULT_TARGET_PEAK
        val out = PcmNormalizer.normalizePeak(samples, targetPeak = target)
        val amp = PcmAmplitude.measure(out)
        assertEquals(target, amp.peak, 0.002f)
        assertTrue("sin clipping: peak=${amp.peak}", amp.peak <= 1f + 1e-6f)
        assertTrue(out.all { abs(it) <= 1f + 1e-6f })
    }

    @Test
    fun normalize_idempotent() {
        val samples = FloatArray(2000) { i ->
            (sin(2.0 * Math.PI * 100.0 * i / 16_000) * 0.3).toFloat()
        }
        val once = PcmNormalizer.normalizePeak(samples)
        val twice = PcmNormalizer.normalizePeak(once)
        val a1 = PcmAmplitude.measure(once)
        val a2 = PcmAmplitude.measure(twice)
        assertEquals(a1.peak, a2.peak, 1e-5f)
        assertEquals(a1.rms, a2.rms, 1e-5f)
    }

    @Test
    fun normalize_alreadyLoud_noClip() {
        val samples = FloatArray(1000) { i ->
            (sin(2.0 * Math.PI * 440.0 * i / 16_000) * 0.95).toFloat()
        }
        val out = PcmNormalizer.normalizePeak(
            samples,
            targetPeak = 0.89125f,
        )
        val amp = PcmAmplitude.measure(out)
        // Escala hacia el target (atenuación leve), sin exceder ±1
        assertEquals(0.89125f, amp.peak, 0.002f)
        assertTrue(out.all { abs(it) <= 1f + 1e-6f })
    }

    @Test
    fun normalize_respectsMaxGain() {
        val samples = FloatArray(500) { 0.05f }
        val out = PcmNormalizer.normalizePeak(
            samples,
            targetPeak = 0.89f,
            maxGain = 4f,
        )
        // 0.05 * 4 = 0.20, no 0.89
        assertEquals(0.20f, PcmAmplitude.measure(out).peak, 0.001f)
    }

    @Test
    fun normalize_silence_passthrough() {
        val samples = FloatArray(100) { 0f }
        val out = PcmNormalizer.normalizePeak(samples)
        assertTrue(out.all { it == 0f })
    }
}
