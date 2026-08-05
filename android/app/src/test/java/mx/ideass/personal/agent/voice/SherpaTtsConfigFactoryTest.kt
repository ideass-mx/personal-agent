package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SherpaTtsConfigFactoryTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun fromModel_piper_setsAbsolutePathsAndSilenceScale() {
        val root = tmp.newFolder("piper")
        val onnx = File(root, "es_MX-claude-high.onnx").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        val tokens = File(root, "tokens.txt").apply { writeText("a") }
        val data = File(root, "espeak-ng-data").apply {
            mkdirs()
            File(this, "phontab").writeBytes(byteArrayOf(1))
        }
        val model = NeuralVoiceModel(
            id = "vits-piper-es_MX-claude-high",
            engine = NeuralVoiceEngine.Piper,
            rootDir = root,
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = data,
            sampleRateHz = 22_050,
        )

        val config = SherpaTtsConfigFactory.fromModel(
            model = model,
            numThreads = 2,
            silenceScale = 0.25f,
            debug = false,
        )

        assertEquals(onnx.absolutePath, config.model.vits.model)
        assertEquals(tokens.absolutePath, config.model.vits.tokens)
        assertEquals(data.absolutePath, config.model.vits.dataDir)
        assertEquals(2, config.model.numThreads)
        assertEquals(0.25f, config.silenceScale, 0.0001f)
        assertEquals("cpu", config.model.provider)
        assertTrue(config.model.kokoro.model.isEmpty())
    }

    @Test
    fun fromModel_kokoro_buildsConfigWhenComplete() {
        val root = tmp.newFolder("kokoro")
        val onnx = File(root, "model.onnx").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        val tokens = File(root, "tokens.txt").apply { writeText("a") }
        val data = File(root, "espeak-ng-data").apply {
            mkdirs()
            File(this, "phontab").writeBytes(byteArrayOf(1))
        }
        val voices = File(root, "voices.bin").apply { writeBytes(byteArrayOf(9)) }
        val lex = File(root, "lexicon-us-en.txt").apply { writeText("x") }
        val model = NeuralVoiceModel(
            id = "kokoro-multi-lang-v1_1",
            engine = NeuralVoiceEngine.Kokoro,
            rootDir = root,
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = data,
            sampleRateHz = 24_000,
            voicesFile = voices,
            lexiconPaths = lex.absolutePath,
        )

        val config = SherpaTtsConfigFactory.fromModel(model, numThreads = 4, silenceScale = 0.2f)
        assertEquals(onnx.absolutePath, config.model.kokoro.model)
        assertEquals(voices.absolutePath, config.model.kokoro.voices)
        assertEquals(tokens.absolutePath, config.model.kokoro.tokens)
        assertEquals(data.absolutePath, config.model.kokoro.dataDir)
        assertEquals(lex.absolutePath, config.model.kokoro.lexicon)
        assertEquals(4, config.model.numThreads)
        assertTrue(config.model.vits.model.isEmpty())
    }

    @Test(expected = IllegalArgumentException::class)
    fun fromModel_rejectsIncomplete() {
        val root = tmp.newFolder("broken")
        val model = NeuralVoiceModel(
            id = "broken",
            engine = NeuralVoiceEngine.Piper,
            rootDir = root,
            modelFile = File(root, "missing.onnx"),
            tokensFile = File(root, "tokens.txt"),
            dataDir = File(root, "espeak-ng-data"),
            sampleRateHz = 22_050,
        )
        SherpaTtsConfigFactory.fromModel(model)
    }
}
