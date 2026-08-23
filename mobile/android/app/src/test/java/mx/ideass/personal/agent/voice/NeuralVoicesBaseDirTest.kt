package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * [NeuralVoicesStore.resolveVoiceBaseDir] localiza la carpeta real aunque el
 * nombre en disco difiera del id (archiveRoot, sufijos no cuantizados).
 * Las carpetas `-int8` abandonadas no se usan al pedir la variante estándar.
 */
class NeuralVoicesBaseDirTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun resolveBaseDir_exactId_works() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        val exact = File(root, NeuralVoicesStore.CP1_TEST_VOICE_ID).also { it.mkdirs() }
        writePiper(exact, NeuralVoicesStore.CP1_TEST_ONNX_NAME)

        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            archiveRoot = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertEquals(exact.canonicalFile, base!!.canonicalFile)
    }

    @Test
    fun resolveBaseDir_ignoresAbandonedInt8WhenStandardRequested() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        val int8 = File(root, "${NeuralVoicesStore.CP1_TEST_VOICE_ID}-int8").also { it.mkdirs() }
        writePiper(int8, NeuralVoicesStore.CP1_TEST_ONNX_NAME)

        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            archiveRoot = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertNull(
            "No reutilizar carpeta -int8 rota al pedir la variante estándar",
            base,
        )
    }

    @Test
    fun resolveBaseDir_prefersStandardOverInt8Sibling() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        val standard = File(root, NeuralVoicesStore.CP1_TEST_VOICE_ID).also { it.mkdirs() }
        writePiper(standard, NeuralVoicesStore.CP1_TEST_ONNX_NAME)
        val int8 = File(root, "${NeuralVoicesStore.CP1_TEST_VOICE_ID}-int8").also { it.mkdirs() }
        writePiper(int8, NeuralVoicesStore.CP1_TEST_ONNX_NAME)

        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            archiveRoot = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertEquals(standard.canonicalFile, base!!.canonicalFile)
    }

    @Test
    fun resolveBaseDir_findsByOnnxWhenNamesDiverge() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        val weird = File(root, "custom-piper-layout").also { it.mkdirs() }
        writePiper(weird, NeuralVoicesStore.CP1_TEST_ONNX_NAME)

        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = "unknown-alias",
            onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertEquals(weird.canonicalFile, base!!.canonicalFile)
    }

    @Test
    fun catalogResolveEntry_legacyInt8MapsToStandard() {
        val entries = listOf(
            VoiceCatalogEntry(
                id = NeuralVoicesStore.CP1_TEST_VOICE_ID,
                displayName = "Claude",
                engine = "piper",
                language = "es-MX",
                sampleRate = 22050,
                sizeBytes = 1,
                downloadUrl = "https://example.com/x",
                sha256 = "aa",
                archiveRoot = NeuralVoicesStore.CP1_TEST_VOICE_ID,
                onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
            ),
        )
        val resolved = VoiceCatalog.resolveEntry(
            entries,
            "${NeuralVoicesStore.CP1_TEST_VOICE_ID}-int8",
        )
        assertNotNull(resolved)
        assertEquals(NeuralVoicesStore.CP1_TEST_VOICE_ID, resolved!!.id)
    }

    @Test
    fun fromCatalog_standardFolder_resolves() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        val real = File(root, NeuralVoicesStore.CP1_TEST_VOICE_ID).also { it.mkdirs() }
        writePiper(real, NeuralVoicesStore.CP1_TEST_ONNX_NAME)

        val entry = VoiceCatalogEntry(
            id = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            displayName = "Claude",
            engine = "piper",
            language = "es-MX",
            sampleRate = 22050,
            sizeBytes = 1,
            downloadUrl = "https://example.com/x",
            sha256 = "aa",
            archiveRoot = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            onnxFile = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = entry.id,
            archiveRoot = entry.archiveRoot,
            onnxFile = entry.onnxFile,
        )
        val model = NeuralVoiceModel.fromCatalogEntry(entry, base!!)
        assertNotNull(model)
        assertTrue(File(model!!.dataDir, "phontab").exists())
        assertEquals(File(real, "espeak-ng-data").canonicalFile, model.dataDir.canonicalFile)
    }

    private fun writePiper(dir: File, onnxName: String) {
        dir.mkdirs()
        File(dir, onnxName).writeBytes(byteArrayOf(1, 2, 3, 4))
        File(dir, "tokens.txt").writeText("t")
        File(dir, "espeak-ng-data").mkdirs()
        File(dir, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
    }
}
