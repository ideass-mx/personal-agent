package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class NeuralVoiceModelTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun resolvePiper_requiresOnnxTokensAndPhontab() {
        val root = tmp.newFolder("voice")
        assertNull(NeuralVoiceModel.resolvePiper("id", root))

        File(root, "tokens.txt").writeText("a\n")
        assertNull(NeuralVoiceModel.resolvePiper("id", root))

        File(root, "model.onnx").writeBytes(byteArrayOf(1, 2, 3))
        assertNull(NeuralVoiceModel.resolvePiper("id", root))

        // Solo el directorio espeak no basta: hace falta phontab.
        File(root, "espeak-ng-data").mkdirs()
        assertNull(NeuralVoiceModel.resolvePiper("id", root))

        File(root, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
        val model = NeuralVoiceModel.resolvePiper("id", root)
        assertNotNull(model)
        assertTrue(model!!.isComplete())
        assertEquals(NeuralVoiceEngine.Piper, model.engine)
        assertEquals("model.onnx", model.modelFile.name)
        assertEquals(NeuralVoiceModel.DEFAULT_PIPER_SAMPLE_RATE_HZ, model.sampleRateHz)
    }

    @Test
    fun resolvePiper_prefersNamedOnnxWhenPresent() {
        val root = tmp.newFolder("voice2")
        File(root, "other.onnx").writeBytes(byteArrayOf(1))
        File(root, "es_MX-claude-high.onnx").writeBytes(byteArrayOf(2))
        File(root, "tokens.txt").writeText("t")
        writeEspeak(root)

        // Dos .onnx → sin preferencia no resuelve.
        assertNull(NeuralVoiceModel.resolvePiper("id", root))

        val model = NeuralVoiceModel.resolvePiper(
            id = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            rootDir = root,
            preferredOnnxName = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertNotNull(model)
        assertEquals(NeuralVoicesStore.CP1_TEST_ONNX_NAME, model!!.modelFile.name)
    }

    @Test
    fun resolvePiper_rejectsEmptyOnnx() {
        val root = tmp.newFolder("empty-onnx")
        File(root, "model.onnx").writeBytes(byteArrayOf())
        File(root, "tokens.txt").writeText("t")
        writeEspeak(root)
        assertNull(NeuralVoiceModel.resolvePiper("id", root))
        assertFalse(
            NeuralVoiceModel(
                id = "id",
                engine = NeuralVoiceEngine.Piper,
                rootDir = root,
                modelFile = File(root, "model.onnx"),
                tokensFile = File(root, "tokens.txt"),
                dataDir = File(root, "espeak-ng-data"),
                sampleRateHz = 22_050,
            ).isComplete(),
        )
    }

    @Test
    fun resolvePiper_fixtureIfPresent() {
        val relative = ".neural-voices/${NeuralVoicesStore.CP1_TEST_VOICE_ID}"
        val candidates = listOf(
            File(relative),
            File("..", relative),
            File("../..", "android/$relative"),
        ).map { it.canonicalFile }
        val fixture = candidates.firstOrNull { it.isDirectory }
        if (fixture == null) {
            return
        }
        val model = NeuralVoiceModel.resolvePiper(
            id = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            rootDir = fixture,
            preferredOnnxName = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertNotNull("Fixture incompleta en ${fixture.absolutePath}", model)
        assertTrue(model!!.isComplete())
        assertTrue(model.modelFile.length() > 1_000_000L)
        assertTrue(File(model.dataDir, "phontab").isFile)
        assertEquals(
            File(fixture, "espeak-ng-data").canonicalFile,
            model.dataDir.canonicalFile,
        )
    }

    @Test
    fun resolvePiper_nestedTarRoot_dataDirPointsToRealEspeak() {
        val install = tmp.newFolder("nested-voice")
        val nested = File(install, "vits-piper-es_MX-claude-high").also { it.mkdirs() }
        File(nested, "es_MX-claude-high.onnx").writeBytes(byteArrayOf(1, 2, 3))
        File(nested, "tokens.txt").writeText("t")
        writeEspeak(nested)
        // Layout plano vacío bajo install (ruta equivocada típica).
        File(install, "espeak-ng-data").mkdirs()

        val model = NeuralVoiceModel.resolvePiper(
            id = "vits-piper-es_MX-claude-high",
            rootDir = install,
            preferredOnnxName = "es_MX-claude-high.onnx",
            archiveRootHint = "vits-piper-es_MX-claude-high",
        )
        assertNotNull(model)
        assertTrue(File(model!!.dataDir, "phontab").exists())
        assertEquals(File(nested, "espeak-ng-data").canonicalFile, model.dataDir.canonicalFile)
        assertFalse(File(install, "espeak-ng-data/phontab").exists())
    }

    @Test
    fun resolveSupertonic_requiresSevenFiles() {
        val root = tmp.newFolder("super")
        assertNull(NeuralVoiceModel.resolveSupertonic("id", root))

        File(root, "duration_predictor.int8.onnx").writeBytes(byteArrayOf(1))
        File(root, "text_encoder.int8.onnx").writeBytes(byteArrayOf(2))
        File(root, "vector_estimator.int8.onnx").writeBytes(byteArrayOf(3))
        File(root, "vocoder.int8.onnx").writeBytes(byteArrayOf(4))
        File(root, "tts.json").writeText("{}")
        File(root, "unicode_indexer.bin").writeBytes(byteArrayOf(5))
        assertNull(NeuralVoiceModel.resolveSupertonic("id", root))

        File(root, "voice.bin").writeBytes(byteArrayOf(6))
        val model = NeuralVoiceModel.resolveSupertonic(
            id = "supertonic-v3-es-f1",
            rootDir = root,
            speakerId = 0,
            language = "es",
        )
        assertNotNull(model)
        assertEquals(NeuralVoiceEngine.Supertonic, model!!.engine)
        assertEquals("es", model.language)
        assertEquals(0, model.defaultSpeakerId)
        assertTrue(model.isComplete())
        assertEquals("duration_predictor.int8.onnx", model.durationPredictorFile!!.name)
        assertEquals("voice.bin", model.voicesFile!!.name)
    }

    @Test
    fun resolveSupertonic_fixtureIfPresent() {
        val relative = ".neural-voices/sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
        val candidates = listOf(
            File(relative),
            File("..", relative),
            File("../..", "android/$relative"),
        ).map { it.canonicalFile }
        val fixture = candidates.firstOrNull { it.isDirectory } ?: return
        val model = NeuralVoiceModel.resolveSupertonic(
            id = "supertonic-v3-es-f1",
            rootDir = fixture,
            language = "es",
        )
        assertNotNull("Fixture incompleta en ${fixture.absolutePath}", model)
        assertTrue(model!!.isComplete())
        assertTrue(model.durationPredictorFile!!.length() > 100_000L)
        assertEquals(44_100, model.sampleRateHz)
    }

    private fun writeEspeak(root: File) {
        File(root, "espeak-ng-data").mkdirs()
        File(root, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
    }
}
