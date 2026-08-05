package mx.ideass.personal.agent.voice

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.FileOutputStream

class VoiceInstallValidatorTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun piperDefaultsRequirePhontab() {
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
        assertEquals(
            listOf(
                "es_MX-claude-high.onnx",
                "tokens.txt",
                "espeak-ng-data/phontab",
            ),
            VoiceInstallValidator.requiredRelativePaths(entry),
        )
    }

    @Test
    fun kokoroDefaultsIncludeVoicesAndPhontab() {
        val entry = VoiceCatalogEntry(
            id = "kokoro",
            displayName = "Kokoro",
            engine = "kokoro",
            language = "multi",
            sampleRate = 24000,
            sizeBytes = 100,
            downloadUrl = "https://example.com/k",
            sha256 = "bb",
            archiveRoot = "kokoro",
            onnxFile = "model.onnx",
            voicesFile = "voices.bin",
            lexiconFiles = listOf("lexicon-us-en.txt"),
        )
        val req = VoiceInstallValidator.requiredRelativePaths(entry)
        assertTrue(req.contains("voices.bin"))
        assertTrue(req.contains("espeak-ng-data/phontab"))
        assertTrue(req.contains("lexicon-us-en.txt"))
    }

    @Test
    fun incompleteExtract_notComplete_andExtractWithPhontab_ok() {
        val archive = File(tmp.root, "voice.tar.bz2")
        writePiperArchive(archive, root = "demo-voice", includePhontab = false)
        val bad = tmp.newFolder("bad")
        TarBz2Extractor.extractFlatteningRoot(archive, bad, "demo-voice")
        val entry = VoiceCatalogEntry(
            id = "demo-voice",
            displayName = "Demo",
            engine = "piper",
            language = "es-MX",
            sampleRate = 22050,
            sizeBytes = 100,
            downloadUrl = "https://example.com/x",
            sha256 = "aa",
            archiveRoot = "demo-voice",
            onnxFile = "model.onnx",
        )
        assertFalse(VoiceInstallValidator.isComplete(entry, bad))
        assertTrue(
            VoiceInstallValidator.missingRelativePaths(entry, bad)
                .contains("espeak-ng-data/phontab"),
        )

        val archiveOk = File(tmp.root, "voice-ok.tar.bz2")
        writePiperArchive(archiveOk, root = "demo-voice", includePhontab = true)
        val good = tmp.newFolder("good")
        TarBz2Extractor.extractFlatteningRoot(archiveOk, good, "demo-voice")
        assertTrue(VoiceInstallValidator.isComplete(entry, good))
        assertTrue(File(good, "espeak-ng-data/phontab").isFile)
        assertTrue(File(good, "model.onnx").isFile)
        assertTrue(File(good, "tokens.txt").isFile)
    }

    private fun writePiperArchive(archive: File, root: String, includePhontab: Boolean) {
        FileOutputStream(archive).use { fos ->
            BZip2CompressorOutputStream(fos).use { bz ->
                TarArchiveOutputStream(bz).use { tar ->
                    tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
                    putDir(tar, "$root/")
                    putFile(tar, "$root/tokens.txt", "hola".toByteArray())
                    putFile(tar, "$root/model.onnx", byteArrayOf(1, 2, 3))
                    putDir(tar, "$root/espeak-ng-data/")
                    if (includePhontab) {
                        putFile(tar, "$root/espeak-ng-data/phontab", byteArrayOf(9, 9))
                    }
                    tar.finish()
                }
            }
        }
    }

    private fun putDir(tar: TarArchiveOutputStream, name: String) {
        val entry = TarArchiveEntry(name)
        entry.mode = 0b111101101
        tar.putArchiveEntry(entry)
        tar.closeArchiveEntry()
    }

    private fun putFile(tar: TarArchiveOutputStream, name: String, data: ByteArray) {
        val entry = TarArchiveEntry(name)
        entry.size = data.size.toLong()
        tar.putArchiveEntry(entry)
        tar.write(data)
        tar.closeArchiveEntry()
    }
}
