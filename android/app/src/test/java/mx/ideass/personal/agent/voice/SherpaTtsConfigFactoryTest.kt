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
            id = "kokoro-es-dora",
            engine = NeuralVoiceEngine.Kokoro,
            rootDir = root,
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = data,
            sampleRateHz = 24_000,
            defaultSpeakerId = 28,
            language = "es",
            voicesFile = voices,
            lexiconPaths = lex.absolutePath,
        )

        val config = SherpaTtsConfigFactory.fromModel(model, numThreads = 4, silenceScale = 0.2f)
        assertEquals(onnx.absolutePath, config.model.kokoro.model)
        assertEquals(voices.absolutePath, config.model.kokoro.voices)
        assertEquals(tokens.absolutePath, config.model.kokoro.tokens)
        assertEquals(data.absolutePath, config.model.kokoro.dataDir)
        assertEquals(lex.absolutePath, config.model.kokoro.lexicon)
        assertEquals("es", config.model.kokoro.lang)
        assertEquals(4, config.model.numThreads)
        assertTrue(config.model.vits.model.isEmpty())
    }

    @Test
    fun fromModel_kokoro_mapsEnUsLang() {
        val root = tmp.newFolder("kokoro-en")
        val onnx = File(root, "model.onnx").apply { writeBytes(byteArrayOf(1)) }
        val tokens = File(root, "tokens.txt").apply { writeText("a") }
        val data = File(root, "espeak-ng-data").apply {
            mkdirs()
            File(this, "phontab").writeBytes(byteArrayOf(1))
        }
        val voices = File(root, "voices.bin").apply { writeBytes(byteArrayOf(9)) }
        val model = NeuralVoiceModel(
            id = "kokoro-en-us-alloy",
            engine = NeuralVoiceEngine.Kokoro,
            rootDir = root,
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = data,
            sampleRateHz = 24_000,
            defaultSpeakerId = 0,
            language = "en-us",
            voicesFile = voices,
        )
        val config = SherpaTtsConfigFactory.fromModel(model)
        assertEquals("en-us", config.model.kokoro.lang)
    }

    @Test
    fun fromModel_supertonic_buildsSevenPaths() {
        val root = tmp.newFolder("supertonic")
        val duration = File(root, "duration_predictor.int8.onnx").apply {
            writeBytes(byteArrayOf(1))
        }
        val textEnc = File(root, "text_encoder.int8.onnx").apply { writeBytes(byteArrayOf(2)) }
        val vector = File(root, "vector_estimator.int8.onnx").apply { writeBytes(byteArrayOf(3)) }
        val vocoder = File(root, "vocoder.int8.onnx").apply { writeBytes(byteArrayOf(4)) }
        val ttsJson = File(root, "tts.json").apply { writeText("{}") }
        val unicode = File(root, "unicode_indexer.bin").apply { writeBytes(byteArrayOf(5)) }
        val voice = File(root, "voice.bin").apply { writeBytes(byteArrayOf(6)) }
        val model = NeuralVoiceModel(
            id = "supertonic-v3-es-f1",
            engine = NeuralVoiceEngine.Supertonic,
            rootDir = root,
            modelFile = duration,
            tokensFile = ttsJson,
            dataDir = root,
            sampleRateHz = 44_100,
            language = "es",
            voicesFile = voice,
            durationPredictorFile = duration,
            textEncoderFile = textEnc,
            vectorEstimatorFile = vector,
            vocoderFile = vocoder,
            ttsJsonFile = ttsJson,
            unicodeIndexerFile = unicode,
        )

        val config = SherpaTtsConfigFactory.fromModel(model, numThreads = 2, silenceScale = 0.2f)
        assertEquals(duration.absolutePath, config.model.supertonic.durationPredictor)
        assertEquals(textEnc.absolutePath, config.model.supertonic.textEncoder)
        assertEquals(vector.absolutePath, config.model.supertonic.vectorEstimator)
        assertEquals(vocoder.absolutePath, config.model.supertonic.vocoder)
        assertEquals(ttsJson.absolutePath, config.model.supertonic.ttsJson)
        assertEquals(unicode.absolutePath, config.model.supertonic.unicodeIndexer)
        assertEquals(voice.absolutePath, config.model.supertonic.voiceStyle)
        assertTrue(config.model.vits.model.isEmpty())
        assertTrue(config.model.kokoro.model.isEmpty())
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
