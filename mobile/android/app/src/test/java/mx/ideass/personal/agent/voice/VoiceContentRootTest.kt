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

class VoiceContentRootTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun discover_flatLayout() {
        val install = tmp.newFolder("flat")
        writePiperLayout(install)
        val root = VoiceContentRoot.discover(install)
        assertNotNull(root)
        assertEquals(install.canonicalFile, root)
        val dataDir = VoiceContentRoot.resolveEspeakDataDir(root!!)!!
        assertTrue(File(dataDir, "phontab").isFile)
    }

    @Test
    fun resolveEspeakDataDir_isParentOfPhontab_notByConvention() {
        val install = tmp.newFolder("search-data")
        val nested = File(install, "tar-root").also { it.mkdirs() }
        writePiperLayout(nested, onnxName = "es_MX-claude-high.onnx")
        // Carpeta vacía en la ruta "convencional" (el bug típico).
        File(install, "espeak-ng-data").mkdirs()

        val dataDir = VoiceContentRoot.resolveEspeakDataDir(install)
        assertNotNull(dataDir)
        assertTrue(File(dataDir!!, "phontab").exists())
        assertEquals(File(nested, "espeak-ng-data").canonicalFile, dataDir.canonicalFile)
        assertFalse(File(install, "espeak-ng-data/phontab").exists())
    }

    @Test
    fun discover_nestedArchiveRoot_resolvesDataDirWithPhontab() {
        val install = tmp.newFolder("nested-install")
        val nested = File(install, "vits-piper-es_MX-claude-high").also { it.mkdirs() }
        writePiperLayout(nested, onnxName = "es_MX-claude-high.onnx")

        val contentRoot = VoiceContentRoot.discover(
            installDir = install,
            archiveRootHint = "vits-piper-es_MX-claude-high",
        )
        assertNotNull(contentRoot)
        assertEquals(nested.canonicalFile, contentRoot)

        val model = NeuralVoiceModel.resolvePiper(
            id = "vits-piper-es_MX-claude-high",
            rootDir = install,
            preferredOnnxName = "es_MX-claude-high.onnx",
            archiveRootHint = "vits-piper-es_MX-claude-high",
        )
        assertNotNull(model)
        assertTrue(File(model!!.dataDir, "phontab").exists())
        assertEquals(nested.canonicalFile, model.rootDir)
        assertTrue(model.modelFile.isAbsolute)
        assertTrue(model.tokensFile.isAbsolute)
        assertTrue(model.dataDir.isAbsolute)
        assertTrue(
            VoiceContentRoot.assertRuntimePaths(
                model.modelFile,
                model.tokensFile,
                model.dataDir,
                searchRoot = install,
                logOnFailure = false,
            ),
        )
    }

    @Test
    fun discover_nestedWithoutHint_walksToPhontab() {
        val install = tmp.newFolder("walk")
        val nested = File(install, "weird-root").also { it.mkdirs() }
        writePiperLayout(nested)
        val root = VoiceContentRoot.discover(install)
        assertEquals(nested.canonicalFile, root)
    }

    @Test
    fun resolveOnnxAndTokens_searchNested() {
        val install = tmp.newFolder("nested-files")
        val nested = File(install, "pkg").also { it.mkdirs() }
        writePiperLayout(nested, onnxName = "voice.onnx")
        assertEquals(
            File(nested, "voice.onnx").canonicalFile,
            VoiceContentRoot.resolveOnnx(install, "voice.onnx")!!.canonicalFile,
        )
        assertEquals(
            File(nested, "tokens.txt").canonicalFile,
            VoiceContentRoot.resolveTokens(install)!!.canonicalFile,
        )
    }

    @Test
    fun assertRuntimePaths_missingPhontab_returnsFalse() {
        val root = tmp.newFolder("bad")
        val onnx = File(root, "m.onnx").also { it.writeBytes(byteArrayOf(1)) }
        val tokens = File(root, "tokens.txt").also { it.writeText("t") }
        val data = File(root, "espeak-ng-data").also { it.mkdirs() }
        assertFalse(
            VoiceContentRoot.assertRuntimePaths(
                onnx,
                tokens,
                data,
                searchRoot = root,
                logOnFailure = false,
            ),
        )
        assertNull(NeuralVoiceModel.resolvePiper("id", root))
        val tree = VoiceContentRoot.formatTree(root)
        assertTrue(tree.contains("espeak-ng-data/"))
        assertTrue(tree.contains("m.onnx"))
    }

    @Test
    fun fromCatalog_nestedInstall_ok() {
        val install = tmp.newFolder("cat-nested")
        val nested = File(install, "vits-piper-es_MX-claude-high").also { it.mkdirs() }
        writePiperLayout(nested, onnxName = "es_MX-claude-high.onnx")
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
        val model = NeuralVoiceModel.fromCatalogEntry(entry, install)
        assertNotNull(model)
        assertTrue(File(model!!.dataDir, "phontab").exists())
        assertTrue(VoiceInstallValidator.isComplete(entry, install))
    }

    @Test
    fun fixture_esMxClaude_dataDirContainsPhontab() {
        val relative = ".neural-voices/${NeuralVoicesStore.CP1_TEST_VOICE_ID}"
        val candidates = listOf(
            File(relative),
            File("..", relative),
            File("../..", "android/$relative"),
        ).map { it.canonicalFile }
        val fixture = candidates.firstOrNull { it.isDirectory } ?: return
        val dataDir = VoiceContentRoot.resolveEspeakDataDir(fixture)
        assertNotNull(dataDir)
        assertTrue(File(dataDir!!, "phontab").exists())
        assertEquals(
            File(fixture, "espeak-ng-data").canonicalFile,
            dataDir.canonicalFile,
        )
    }

    private fun writePiperLayout(dir: File, onnxName: String = "model.onnx") {
        File(dir, onnxName).writeBytes(byteArrayOf(1, 2, 3))
        File(dir, "tokens.txt").writeText("t")
        File(dir, "espeak-ng-data").mkdirs()
        File(dir, "espeak-ng-data/phontab").writeBytes(byteArrayOf(9))
    }
}
