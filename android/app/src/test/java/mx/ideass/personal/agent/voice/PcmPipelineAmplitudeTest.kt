package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Diagnóstico medido del pipeline TTS con un recorte real de Piper
 * (es_MX-claude-high vía sherpa-onnx-offline-tts).
 *
 * Evidencia de referencia (frase completa, host Linux, misma API OfflineTts):
 * - sherpa float: peak≈0.421 (−7.5 dBFS), RMS≈0.085 (−21.4 dBFS)
 * - float→int16: sin atenuación (×1.000)
 * - resample 22050→16000: ~−1.5 % peak (despreciable)
 * Conclusión: el audio sale bajo de origen → normalizar pico a ~−1 dBFS.
 */
class PcmPipelineAmplitudeTest {

    @Test
    fun piperFixture_originIsLow_pipelineDoesNotAttenuateMuch() {
        val (rate, pcm) = loadFixtureWav()
        assertEquals(22_050, rate)
        assertTrue("fixture vacío", pcm.isNotEmpty())

        // El WAV es int16; reconstruimos float como hace el engine (÷32767).
        val floats = FloatArray(pcm.size) { i -> pcm[i] / 32767f }
        val report = PcmPipelineProbe.measureStages(
            floats = floats,
            srcRateHz = rate,
            dstRateHz = 16_000,
        )

        val lines = report.lines()
        println(lines.joinToString("\n"))

        val origin = report.sherpaFloat
        // Pico de origen claramente por debajo de full-scale (voz baja de Piper).
        assertTrue(
            "origen debería ser bajo: peak=${origin.peak} dBFS=${origin.peakDbFs}",
            origin.peak in 0.15f..0.70f,
        )
        assertTrue(
            "origen ≪ 1.0 (−7.5 dBFS típico): peakDbFs=${origin.peakDbFs}",
            origin.peakDbFs < -3f,
        )

        // float→int16 no debe atenuar.
        val ratioInt16 = report.afterInt16.peak / origin.peak.coerceAtLeast(1e-6f)
        assertEquals("float→int16 debe preservar pico", 1.0, ratioInt16.toDouble(), 0.01)

        val afterResample = report.afterResample
        assertNotNull(afterResample)
        val ratioResample = afterResample!!.peak / report.afterInt16.peak.coerceAtLeast(1e-6f)
        assertTrue(
            "resample no debe atenuar mucho: ratio=$ratioResample",
            ratioResample in 0.90f..1.05f,
        )
    }

    @Test
    fun piperFixture_afterNormalize_reachesTargetWithoutClipping() {
        val (rate, pcm) = loadFixtureWav()
        val floats = FloatArray(pcm.size) { i -> pcm[i] / 32767f }
        val target = PcmNormalizer.DEFAULT_TARGET_PEAK
        val normalized = PcmNormalizer.normalizePeak(floats, targetPeak = target)
        val amp = PcmAmplitude.measure(normalized)
        assertEquals(target, amp.peak, 0.005f)
        assertTrue(normalized.all { kotlin.math.abs(it) <= 1f + 1e-6f })

        val report = PcmPipelineProbe.measureStages(
            floats = normalized,
            srcRateHz = rate,
            dstRateHz = 16_000,
        )
        assertTrue(
            "post-pipeline peak cerca del target: ${report.afterResample!!.peak}",
            report.afterResample!!.peak in 0.85f..1.0f,
        )
    }

    /** PCM WAV mono 16-bit LE (sin depender de javax.sound). */
    private fun loadFixtureWav(): Pair<Int, ShortArray> {
        val stream = javaClass.classLoader!!.getResourceAsStream(
            "voice/piper_es_mx_claude_phrase.wav",
        ) ?: error("Falta fixture voice/piper_es_mx_claude_phrase.wav")
        val bytes = stream.use { it.readBytes() }
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        fun FourCc(): String = buildString {
            repeat(4) { append(buf.get().toInt().toChar()) }
        }
        require(FourCc() == "RIFF") { "no RIFF" }
        buf.int // file size
        require(FourCc() == "WAVE") { "no WAVE" }
        var rate = 0
        var dataOffset = -1
        var dataSize = 0
        while (buf.remaining() >= 8) {
            val id = FourCc()
            val size = buf.int
            when (id) {
                "fmt " -> {
                    val audioFormat = buf.short.toInt()
                    val channels = buf.short.toInt()
                    rate = buf.int
                    buf.int // byte rate
                    buf.short // block align
                    val bits = buf.short.toInt()
                    require(audioFormat == 1) { "esperado PCM" }
                    require(channels == 1) { "esperado mono" }
                    require(bits == 16) { "esperado 16-bit" }
                    if (size > 16) buf.position(buf.position() + (size - 16))
                }
                "data" -> {
                    dataOffset = buf.position()
                    dataSize = size
                    break
                }
                else -> buf.position(buf.position() + size)
            }
        }
        require(dataOffset >= 0) { "sin chunk data" }
        buf.position(dataOffset)
        val samples = ShortArray(dataSize / 2)
        for (i in samples.indices) samples[i] = buf.short
        return rate to samples
    }
}
