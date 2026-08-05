package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class NeuralVoiceFromCatalogTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun fromCatalog_piperComplete() {
        val root = tmp.newFolder("piper")
        File(root, "es_MX-claude-high.onnx").writeBytes(byteArrayOf(1, 2, 3))
        File(root, "tokens.txt").writeText("t")
        File(root, "espeak-ng-data").mkdirs()
        File(root, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
        val entry = VoiceCatalogEntry(
            id = "vits-piper-es_MX-claude-high",
            displayName = "Claude",
            engine = "piper",
            language = "es-MX",
            sampleRate = 22050,
            sizeBytes = 100,
            downloadUrl = "https://example.com/x",
            sha256 = "aa",
            archiveRoot = "vits-piper-es_MX-claude-high",
            onnxFile = "es_MX-claude-high.onnx",
        )
        val model = NeuralVoiceModel.fromCatalogEntry(entry, root)
        assertNotNull(model)
        assertEquals(NeuralVoiceEngine.Piper, model!!.engine)
    }

    @Test
    fun fromCatalog_piperMissingPhontab_notInstalled() {
        val root = tmp.newFolder("piper-bad")
        File(root, "es_MX-claude-high.onnx").writeBytes(byteArrayOf(1, 2, 3))
        File(root, "tokens.txt").writeText("t")
        File(root, "espeak-ng-data").mkdirs()
        val entry = VoiceCatalogEntry(
            id = "vits-piper-es_MX-claude-high",
            displayName = "Claude",
            engine = "piper",
            language = "es-MX",
            sampleRate = 22050,
            sizeBytes = 100,
            downloadUrl = "https://example.com/x",
            sha256 = "aa",
            archiveRoot = "vits-piper-es_MX-claude-high",
            onnxFile = "es_MX-claude-high.onnx",
        )
        assertNull(NeuralVoiceModel.fromCatalogEntry(entry, root))
        assertEquals(
            listOf("espeak-ng-data/phontab"),
            VoiceInstallValidator.missingRelativePaths(entry, root),
        )
    }

    @Test
    fun fromCatalog_kokoroNeedsVoicesBinAndPhontab() {
        val root = tmp.newFolder("kokoro")
        File(root, "model.onnx").writeBytes(byteArrayOf(1))
        File(root, "tokens.txt").writeText("t")
        File(root, "espeak-ng-data").mkdirs()
        File(root, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
        File(root, "lexicon-us-en.txt").writeText("a")
        val entry = VoiceCatalogEntry(
            id = "kokoro-multi-lang-v1_0",
            displayName = "Kokoro",
            engine = "kokoro",
            language = "multi",
            sampleRate = 24000,
            sizeBytes = 100,
            downloadUrl = "https://example.com/k",
            sha256 = "bb",
            archiveRoot = "kokoro-multi-lang-v1_0",
            onnxFile = "model.onnx",
            voicesFile = "voices.bin",
            lexiconFiles = listOf("lexicon-us-en.txt"),
        )
        assertNull(NeuralVoiceModel.fromCatalogEntry(entry, root))
        File(root, "voices.bin").writeBytes(byteArrayOf(2))
        val model = NeuralVoiceModel.fromCatalogEntry(entry, root)
        assertNotNull(model)
        assertEquals(NeuralVoiceEngine.Kokoro, model!!.engine)
        assertTrue(model.lexiconPaths.contains("lexicon-us-en.txt"))
    }
}
