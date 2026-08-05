package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SherpaOfflineTtsCacheTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Before
    fun reset() {
        SherpaOfflineTtsCache.resetForTests()
        SherpaOfflineTtsCache.createSynthesizer = { model, _, _, _ ->
            SherpaOfflineSynthesizer.createTestStub(model)
        }
    }

    @Test
    fun sameVoice_twoSyntheses_reusesOfflineTts() {
        val model = kokoroModel(tmp.newFolder("kokoro"), sid = 28, language = "es")
        val a = SherpaOfflineTtsCache.getOrCreate(model)
        val b = SherpaOfflineTtsCache.getOrCreate(model)
        assertNotNull(a)
        assertSame(a, b)
        assertEquals(1, SherpaOfflineTtsCache.createCount)
        assertTrue(SherpaOfflineTtsCache.lastWasHit)
    }

    @Test
    fun samePackageDifferentSpeakerSameLang_reusesOfflineTts() {
        val root = tmp.newFolder("kokoro-shared")
        val dora = kokoroModel(root, sid = 28, language = "es", id = "kokoro-es-dora")
        val alex = kokoroModel(root, sid = 29, language = "es", id = "kokoro-es-alex")
        val a = SherpaOfflineTtsCache.getOrCreate(dora)
        val b = SherpaOfflineTtsCache.getOrCreate(alex)
        assertSame(a, b)
        assertEquals(1, SherpaOfflineTtsCache.createCount)
    }

    @Test
    fun changeKokoroLang_recreatesAndReleasesPrevious() {
        val rootEs = tmp.newFolder("kokoro-es")
        val rootEn = tmp.newFolder("kokoro-en")
        val es = kokoroModel(rootEs, sid = 28, language = "es")
        val en = kokoroModel(rootEn, sid = 0, language = "en-us")
        val first = SherpaOfflineTtsCache.getOrCreate(es)
        val second = SherpaOfflineTtsCache.getOrCreate(en)
        assertNotNull(first)
        assertNotNull(second)
        assertNotSame(first, second)
        assertEquals(2, SherpaOfflineTtsCache.createCount)
        assertFalse(SherpaOfflineTtsCache.lastWasHit)
        assertEquals(
            SherpaOfflineTtsCache.Key.from(en, 2, 0.2f),
            SherpaOfflineTtsCache.cachedKeyOrNull(),
        )
    }

    @Test
    fun releaseIfRoot_clearsMatchingCache() {
        val root = tmp.newFolder("kokoro-del")
        val model = kokoroModel(root, sid = 28, language = "es")
        assertNotNull(SherpaOfflineTtsCache.getOrCreate(model))
        SherpaOfflineTtsCache.releaseIfRoot(root.absolutePath)
        assertNull(SherpaOfflineTtsCache.cachedKeyOrNull())
        val again = SherpaOfflineTtsCache.getOrCreate(model)
        assertNotNull(again)
        assertEquals(2, SherpaOfflineTtsCache.createCount)
        assertFalse(SherpaOfflineTtsCache.lastWasHit)
    }

    @Test
    fun key_ignoresSpeakerId_includesEspeakLang() {
        val root = tmp.newFolder("kokoro-key")
        val dora = kokoroModel(root, sid = 28, language = "es")
        val alex = kokoroModel(root, sid = 29, language = "es")
        assertEquals(
            SherpaOfflineTtsCache.Key.from(dora, 2, 0.2f),
            SherpaOfflineTtsCache.Key.from(alex, 2, 0.2f),
        )
        val en = kokoroModel(root, sid = 0, language = "en-us")
        assertTrue(
            SherpaOfflineTtsCache.Key.from(dora, 2, 0.2f) !=
                SherpaOfflineTtsCache.Key.from(en, 2, 0.2f),
        )
    }

    private fun kokoroModel(
        root: File,
        sid: Int,
        language: String,
        id: String = "kokoro-$language-$sid",
    ): NeuralVoiceModel {
        root.mkdirs()
        val onnx = File(root, "model.onnx").also { it.writeBytes(byteArrayOf(1, 2, 3)) }
        val tokens = File(root, "tokens.txt").also { it.writeText("t") }
        val voices = File(root, "voices.bin").also { it.writeBytes(byteArrayOf(1)) }
        val data = File(root, "espeak-ng-data").also { it.mkdirs() }
        File(data, "phontab").writeBytes(byteArrayOf(1))
        return NeuralVoiceModel(
            id = id,
            engine = NeuralVoiceEngine.Kokoro,
            rootDir = root,
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = data,
            sampleRateHz = 24_000,
            defaultSpeakerId = sid,
            language = language,
            voicesFile = voices,
            lexiconPaths = "",
        )
    }
}
