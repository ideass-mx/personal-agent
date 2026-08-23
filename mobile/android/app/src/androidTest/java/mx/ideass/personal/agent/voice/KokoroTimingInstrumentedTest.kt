package mx.ideass.personal.agent.voice

import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.atomic.AtomicLong

/**
 * Mide carga OfflineTts + inferencia Kokoro en dispositivo (misma frase de preview).
 * Requiere el paquete instalado en files/neural_voices/ o adb push a /data/local/tmp/.
 *
 * Logcat: `adb logcat -s KokoroTiming:I`
 */
@RunWith(AndroidJUnit4::class)
class KokoroTimingInstrumentedTest {

    @Before
    fun resetCache() {
        SherpaOfflineTtsCache.resetForTests()
    }

    @Test
    fun measureLoadAndTwoSyntheses_reportsStages() {
        val root = resolveKokoroRoot()
        assumeTrue("Kokoro no en dispositivo", root != null)

        val model = NeuralVoiceModel.resolveKokoro(
            id = "kokoro-es-dora",
            rootDir = root!!,
            onnxName = "model.onnx",
            speakerId = 28,
            language = "es",
            lexiconFiles = listOf("lexicon-us-en.txt", "lexicon-zh.txt"),
        )
        assertNotNull(model)
        assertTrue(model!!.isComplete())

        val phrase = "Hola, soy el agente. Así suena esta voz neuronal."
        val numThreads = 4

        val tLoad0 = SystemClock.elapsedRealtime()
        val a = SherpaOfflineTtsCache.getOrCreate(
            model = model,
            numThreads = numThreads,
            silenceScale = 0.2f,
        )
        val loadMs = SystemClock.elapsedRealtime() - tLoad0
        assertNotNull("OfflineTts no cargó Kokoro", a)

        val tLoad1 = SystemClock.elapsedRealtime()
        val b = SherpaOfflineTtsCache.getOrCreate(
            model = model,
            numThreads = numThreads,
            silenceScale = 0.2f,
        )
        val reuseMs = SystemClock.elapsedRealtime() - tLoad1
        assertSame(a, b)
        assertTrue(SherpaOfflineTtsCache.lastWasHit)
        assertTrue(SherpaOfflineTtsCache.createCount == 1)

        val firstChunkMs = AtomicLong(-1L)
        val tInfer0 = SystemClock.elapsedRealtime()
        val result = a!!.synthesize(
            text = phrase,
            sid = 28,
            speed = 1.0f,
            language = "es",
        ) { samples ->
            if (samples.isNotEmpty()) {
                firstChunkMs.compareAndSet(-1L, SystemClock.elapsedRealtime() - tInfer0)
            }
            true
        }
        val inferMs = SystemClock.elapsedRealtime() - tInfer0

        val tInfer1 = SystemClock.elapsedRealtime()
        val result2 = a.synthesize(text = phrase, sid = 28, speed = 1.0f, language = "es")
        val infer2Ms = SystemClock.elapsedRealtime() - tInfer1

        Log.i(
            TAG,
            "timing: loadMs=$loadMs reuseMs=$reuseMs " +
                "provider=${a.provider} createCount=${SherpaOfflineTtsCache.createCount} " +
                "infer1Ms=$inferMs firstChunkMs=${firstChunkMs.get()} " +
                "infer2Ms=$infer2Ms chunks=${result.chunkCount} " +
                "samples=${result.samples.size} rate=${result.sampleRateHz} " +
                "samples2=${result2.samples.size}",
        )

        assertTrue(result.samples.isNotEmpty())
        assertTrue(result2.samples.isNotEmpty())
        assertTrue("createCount debe ser 1 tras dos getOrCreate", SherpaOfflineTtsCache.createCount == 1)
    }

    private fun resolveKokoroRoot(): File? {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val candidates = listOf(
            File(ctx.filesDir, "neural_voices/kokoro-multi-lang-v1_0"),
            File("/data/local/tmp/kokoro-multi-lang-v1_0"),
        )
        return candidates.firstOrNull { dir ->
            NeuralVoiceModel.resolveKokoro(
                id = "probe",
                rootDir = dir,
                onnxName = "model.onnx",
                speakerId = 28,
                language = "es",
            )?.isComplete() == true
        }
    }

    companion object {
        private const val TAG = "KokoroTiming"
    }
}
