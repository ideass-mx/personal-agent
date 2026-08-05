package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class VoiceCatalogParseTest {

    @Test
    fun parseCuratedCatalog_hasPiperAndKokoro() {
        val json = """
            {
              "voices": [
                {
                  "id": "vits-piper-es_MX-claude-high",
                  "displayName": "Claude · México",
                  "engine": "piper",
                  "language": "es-MX",
                  "gender": "male",
                  "sampleRate": 22050,
                  "sizeBytes": 67207890,
                  "sizeMB": 67,
                  "recommended": true,
                  "downloadUrl": "https://example.com/a.tar.bz2",
                  "sha256": "abc",
                  "archiveRoot": "vits-piper-es_MX-claude-high",
                  "onnxFile": "es_MX-claude-high.onnx",
                  "speakerId": 0
                },
                {
                  "id": "kokoro-multi-lang-v1_0",
                  "displayName": "Kokoro",
                  "engine": "kokoro",
                  "language": "multi",
                  "sampleRate": 24000,
                  "sizeBytes": 349418188,
                  "downloadUrl": "https://example.com/k.tar.bz2",
                  "sha256": "def",
                  "archiveRoot": "kokoro-multi-lang-v1_0",
                  "onnxFile": "model.onnx",
                  "voicesFile": "voices.bin",
                  "lexiconFiles": ["lexicon-us-en.txt", "lexicon-zh.txt"],
                  "speakerId": 0
                }
              ]
            }
        """.trimIndent()

        val voices = VoiceCatalog.parse(json)
        assertEquals(2, voices.size)
        val piper = voices.first { it.engine == "piper" }
        assertTrue(piper.recommended)
        assertEquals(NeuralVoiceEngine.Piper, piper.engineType())
        assertFalse(piper.id.contains("int8"))
        assertFalse(piper.downloadUrl.contains("int8"))
        val kokoro = voices.first { it.engine == "kokoro" }
        assertEquals(NeuralVoiceEngine.Kokoro, kokoro.engineType())
        assertEquals("model.onnx", kokoro.onnxFile)
        assertEquals("voices.bin", kokoro.voicesFile)
        assertEquals(2, kokoro.lexiconFiles.size)
    }

    @Test
    fun assetCatalog_claudeHighIsNonQuantized() {
        val file = File("src/main/assets/voice_catalog.json")
        assertTrue("assets/voice_catalog.json debe existir en el módulo app", file.isFile)
        val voices = VoiceCatalog.parse(file.readText())
        val claude = voices.firstOrNull { it.id.contains("claude-high") }
        assertNotNull(claude)
        assertEquals("vits-piper-es_MX-claude-high", claude!!.id)
        assertEquals("vits-piper-es_MX-claude-high", claude.archiveRoot)
        assertTrue(claude.downloadUrl.endsWith("vits-piper-es_MX-claude-high.tar.bz2"))
        assertFalse(claude.downloadUrl.contains("int8"))
        assertFalse(claude.id.contains("int8"))
        assertTrue(claude.recommended)
        assertEquals(67, claude.sizeMB)
        // Ninguna entrada del catálogo debe ser cuantizada por defecto.
        for (v in voices) {
            assertFalse("Catálogo no debe listar int8: ${v.id}", v.id.contains("int8"))
            assertFalse(v.downloadUrl.contains("int8"))
            assertFalse(v.onnxFile.contains("int8"))
        }
    }

    @Test
    fun resolveEntry_legacyInt8IdMapsToStandard() {
        val entries = VoiceCatalog.parse(
            File("src/main/assets/voice_catalog.json").readText(),
        )
        val resolved = VoiceCatalog.resolveEntry(
            entries,
            "vits-piper-es_MX-claude-high-int8",
        )
        assertNotNull(resolved)
        assertEquals("vits-piper-es_MX-claude-high", resolved!!.id)
    }

    @Test
    fun downloadProgressFraction() {
        val p = VoiceDownloadStatus.Downloading(50, 100)
        assertEquals(0.5f, p.progressFraction, 0.001f)
        assertEquals(0f, VoiceDownloadStatus.Downloading(10, null).progressFraction, 0.001f)
    }
}
