package mx.ideass.personal.agent.voice

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.FileOutputStream

class TarBz2ExtractorTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun extractFlatteningRoot_writesFilesAndRejectsNothingNormal() {
        val archive = File(tmp.root, "voice.tar.bz2")
        writeSampleArchive(archive, root = "demo-voice")

        val dest = tmp.newFolder("out")
        TarBz2Extractor.extractFlatteningRoot(archive, dest, archiveRoot = "demo-voice")

        assertTrue(File(dest, "tokens.txt").isFile)
        assertEquals("hola", File(dest, "tokens.txt").readText())
        assertTrue(File(dest, "model.onnx").isFile)
        assertTrue(File(dest, "espeak-ng-data").isDirectory)
        assertTrue(File(dest, "espeak-ng-data/phontab").isFile)
    }

    @Test
    fun sha256_matchesKnownDigest() {
        val f = tmp.newFile("x.bin")
        f.writeBytes(byteArrayOf(1, 2, 3, 4, 5))
        val hex = FileSha256.hex(f)
        assertEquals(64, hex.length)
        assertTrue(FileSha256.matches(f, hex))
        assertTrue(FileSha256.matches(f, hex.uppercase()))
        assertTrue(!FileSha256.matches(f, "00".repeat(32)))
    }

    private fun writeSampleArchive(archive: File, root: String) {
        FileOutputStream(archive).use { fos ->
            BZip2CompressorOutputStream(fos).use { bz ->
                TarArchiveOutputStream(bz).use { tar ->
                    tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
                    putDir(tar, "$root/")
                    putFile(tar, "$root/tokens.txt", "hola".toByteArray())
                    putFile(tar, "$root/model.onnx", byteArrayOf(1, 2, 3))
                    putDir(tar, "$root/espeak-ng-data/")
                    putFile(tar, "$root/espeak-ng-data/phontab", byteArrayOf(9))
                    tar.finish()
                }
            }
        }
    }

    private fun putDir(tar: TarArchiveOutputStream, name: String) {
        val entry = TarArchiveEntry(name)
        entry.mode = 0b111101101 // 0755
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
