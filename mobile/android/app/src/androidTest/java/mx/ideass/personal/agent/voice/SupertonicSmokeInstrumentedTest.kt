package mx.ideass.personal.agent.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * CP-S0 smoke-test (dispositivo arm64): carga OfflineTtsSupertonic + sintetiza
 * una frase en español. Si el ORT del AAR crashea con int8 (como Piper),
 * este test aborta el proceso — señal de parada para no construir UI.
 *
 * Preparación (host):
 *   adb push android/.neural-voices/sherpa-onnx-supertonic-3-tts-int8-2026-05-11 \
 *     /data/local/tmp/sherpa-onnx-supertonic-3-tts-int8-2026-05-11
 */
@RunWith(AndroidJUnit4::class)
class SupertonicSmokeInstrumentedTest {

    @Test
    fun loadAndSynthesizeSpanishSid0() {
        val candidates = listOf(
            File("/data/local/tmp/sherpa-onnx-supertonic-3-tts-int8-2026-05-11"),
            File(
                InstrumentationRegistry.getInstrumentation().targetContext.filesDir,
                "neural_voices/sherpa-onnx-supertonic-3-tts-int8-2026-05-11",
            ),
        )
        val root = candidates.firstOrNull { VoiceInstallValidator.isSupertonicDirComplete(it) }
        assumeTrue(
            "Modelo Supertonic no en dispositivo (adb push a /data/local/tmp/…)",
            root != null,
        )

        val model = NeuralVoiceModel.resolveSupertonic(
            id = "supertonic-v3-es-f1",
            rootDir = root!!,
            speakerId = 0,
            language = "es",
        )
        assertNotNull("resolveSupertonic falló en ${root.absolutePath}", model)
        assertTrue(model!!.isComplete())

        val synth = SherpaOfflineSynthesizer.createOrNull(model, numThreads = 2)
        assertNotNull(
            "OfflineTts no cargó Supertonic int8 (¿crash ORT? revisar logcat)",
            synth,
        )
        synth!!.use { engine ->
            val result = engine.synthesize(
                text = "Hola, soy el agente. Esta es una prueba de Supertonic en español.",
                sid = 0,
                speed = 1.0f,
            )
            assertTrue(
                "Síntesis vacía (samples=${result.samples.size} rate=${result.sampleRateHz})",
                result.samples.isNotEmpty(),
            )
            assertTrue(result.sampleRateHz >= 16_000)
            val peak = result.samples.maxOf { kotlin.math.abs(it) }
            assertTrue("Audio silencioso (peak=$peak)", peak > 1e-4f)
        }
    }
}
