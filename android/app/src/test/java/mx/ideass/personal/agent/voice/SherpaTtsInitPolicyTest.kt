package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SherpaTtsInitPolicyTest {

    @Test
    fun onInitResult_readyWhenSynthAvailable() {
        assertEquals(SherpaInitOutcome.Ready, SherpaTtsInitPolicy.onInitResult(true))
    }

    @Test
    fun onInitResult_fallbackWhenSynthUnavailable() {
        assertEquals(
            SherpaInitOutcome.FallbackAndroid,
            SherpaTtsInitPolicy.onInitResult(false),
        )
    }
}

class SherpaNativeLibsTest {

    @Before
    fun reset() {
        SherpaNativeLibs.resetForTests()
        SherpaNativeLibs.loadLibrary = { name -> System.loadLibrary(name) }
    }

    @Test
    fun loadOrder_onnxruntimeBeforeJni() {
        assertEquals(listOf("onnxruntime", "sherpa-onnx-jni"), SherpaNativeLibs.LOAD_ORDER)
    }

    @Test
    fun ensureLoaded_missingOnnxruntime_returnsFalseWithoutCrash() {
        val attempted = mutableListOf<String>()
        SherpaNativeLibs.loadLibrary = { name ->
            attempted.add(name)
            throw UnsatisfiedLinkError("couldn't find \"lib$name.so\"")
        }
        assertFalse(SherpaNativeLibs.ensureLoaded())
        assertFalse(SherpaNativeLibs.isReady())
        assertEquals(listOf("onnxruntime"), attempted)
        assertTrue(SherpaNativeLibs.lastLoadError() is UnsatisfiedLinkError)
        // Idempotente: no reintenta tras fallo.
        assertFalse(SherpaNativeLibs.ensureLoaded())
        assertEquals(listOf("onnxruntime"), attempted)
    }

    @Test
    fun ensureLoaded_ok_loadsBothInOrder() {
        val attempted = mutableListOf<String>()
        SherpaNativeLibs.loadLibrary = { name -> attempted.add(name) }
        assertTrue(SherpaNativeLibs.ensureLoaded())
        assertTrue(SherpaNativeLibs.isReady())
        assertEquals(listOf("onnxruntime", "sherpa-onnx-jni"), attempted)
        assertNull(SherpaNativeLibs.lastLoadError())
    }
}

class SherpaOfflineSynthesizerGuardTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Before
    fun resetNative() {
        SherpaNativeLibs.resetForTests()
        SherpaNativeLibs.loadLibrary = { /* no-op en JVM */ }
    }

    @Test
    fun createOrNull_nativeRuntimeFailure_returnsNull() {
        val root = tmp.newFolder("voice")
        writePiper(root, "es_MX-claude-high.onnx")
        val model = NeuralVoiceModel.resolvePiper(
            id = "vits-piper-es_MX-claude-high",
            rootDir = root,
            preferredOnnxName = "es_MX-claude-high.onnx",
        )
        assertTrue(model != null && model.isComplete())

        val previous = SherpaOfflineSynthesizer.createOfflineTts
        try {
            SherpaOfflineSynthesizer.createOfflineTts = {
                throw UnsatisfiedLinkError("simulated native crash / incompatible onnx")
            }
            val synth = SherpaOfflineSynthesizer.createOrNull(model!!)
            assertNull(synth)
            assertEquals(
                SherpaInitOutcome.FallbackAndroid,
                SherpaTtsInitPolicy.onInitResult(synth != null),
            )
        } finally {
            SherpaOfflineSynthesizer.createOfflineTts = previous
        }
    }

    @Test
    fun createOrNull_missingNativeLibs_returnsNullBeforeOfflineTts() {
        val root = tmp.newFolder("voice2")
        writePiper(root, "es_MX-claude-high.onnx")
        val model = NeuralVoiceModel.resolvePiper(
            id = "vits-piper-es_MX-claude-high",
            rootDir = root,
            preferredOnnxName = "es_MX-claude-high.onnx",
        )!!

        SherpaNativeLibs.loadLibrary = {
            throw UnsatisfiedLinkError("couldn't find \"libonnxruntime.so\"")
        }
        var factoryCalled = false
        val previous = SherpaOfflineSynthesizer.createOfflineTts
        try {
            SherpaOfflineSynthesizer.createOfflineTts = {
                factoryCalled = true
                error("no debería llamarse")
            }
            assertNull(SherpaOfflineSynthesizer.createOrNull(model))
            assertFalse(factoryCalled)
            assertEquals(
                SherpaInitOutcome.FallbackAndroid,
                SherpaTtsInitPolicy.onInitResult(false),
            )
        } finally {
            SherpaOfflineSynthesizer.createOfflineTts = previous
        }
    }

    @Test
    fun createOrNull_incompletePaths_returnsNullWithoutCallingFactory() {
        val root = tmp.newFolder("incomplete")
        File(root, "es_MX-claude-high.onnx").writeBytes(byteArrayOf(1))
        val model = NeuralVoiceModel(
            id = "broken",
            engine = NeuralVoiceEngine.Piper,
            rootDir = root,
            modelFile = File(root, "es_MX-claude-high.onnx"),
            tokensFile = File(root, "missing-tokens.txt"),
            dataDir = File(root, "missing-espeak"),
            sampleRateHz = 22_050,
        )
        var factoryCalled = false
        val previous = SherpaOfflineSynthesizer.createOfflineTts
        try {
            SherpaOfflineSynthesizer.createOfflineTts = {
                factoryCalled = true
                error("no debería llamarse")
            }
            assertNull(SherpaOfflineSynthesizer.createOrNull(model))
            assertTrue(!factoryCalled)
        } finally {
            SherpaOfflineSynthesizer.createOfflineTts = previous
        }
    }

    /**
     * Regresión: JNI de sherpa-onnx 1.13.4 busca exactamente
     * `invoke([F)Ljava/lang/Integer;` (no el `invoke([F)I` de lambdas Kotlin).
     */
    @Test
    fun jniChunkCallback_exposesBoxedIntegerInvokeSignature() {
        val acc = SherpaSynthChunkAccumulator()
        val cb = SherpaOfflineSynthesizer.jniChunkCallback(
            onChunk = { true },
            accumulator = acc,
        )
        val method = cb.javaClass.getMethod("invoke", FloatArray::class.java)
        assertEquals(java.lang.Integer::class.java, method.returnType)
        val result = method.invoke(cb, floatArrayOf(0.1f, 0.2f))
        assertTrue(result is java.lang.Integer)
        assertEquals(1, (result as java.lang.Integer).toInt())
        assertEquals(1, acc.chunkCount)
    }

    @Test
    fun jniChunkCallback_stopReturnsBoxedZero() {
        val acc = SherpaSynthChunkAccumulator()
        val cb = SherpaOfflineSynthesizer.jniChunkCallback(
            onChunk = { false },
            accumulator = acc,
        )
        val result = cb.invoke(floatArrayOf(0.5f))
        assertEquals(0, result)
        assertTrue(acc.wasStoppedEarly)
    }

    private fun writePiper(dir: File, onnxName: String) {
        dir.mkdirs()
        File(dir, onnxName).writeBytes(byteArrayOf(1, 2, 3, 4))
        File(dir, "tokens.txt").writeText("t")
        File(dir, "espeak-ng-data").mkdirs()
        File(dir, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
    }
}
