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
    fun parseCuratedCatalog_hasPiperAndKokoroSpeakers() {
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
                  "id": "kokoro-es-dora",
                  "displayName": "Kokoro ES · Dora",
                  "engine": "kokoro",
                  "language": "es",
                  "gender": "female",
                  "sampleRate": 24000,
                  "sizeBytes": 349418188,
                  "downloadUrl": "https://example.com/k.tar.bz2",
                  "sha256": "def",
                  "archiveRoot": "kokoro-multi-lang-v1_0",
                  "packageId": "kokoro-multi-lang-v1_0",
                  "onnxFile": "model.onnx",
                  "voicesFile": "voices.bin",
                  "lexiconFiles": ["lexicon-us-en.txt", "lexicon-zh.txt"],
                  "speakerId": 28
                }
              ]
            }
        """.trimIndent()

        val voices = VoiceCatalog.parse(json)
        assertEquals(2, voices.size)
        val piper = voices.first { it.engine == "piper" }
        assertTrue(piper.recommended)
        assertEquals(NeuralVoiceEngine.Piper, piper.engineType())
        val kokoro = voices.first { it.engine == "kokoro" }
        assertEquals(NeuralVoiceEngine.Kokoro, kokoro.engineType())
        assertEquals("kokoro-multi-lang-v1_0", kokoro.installId())
        assertEquals(28, kokoro.speakerId)
        assertEquals("voices.bin", kokoro.voicesFile)
    }

    @Test
    fun assetCatalog_kokoroEsSpeakersShareV1_0Package() {
        val voices = VoiceCatalog.parse(
            File("src/main/assets/voice_catalog.json").readText(),
        )
        val kokoro = voices.filter { it.engine == "kokoro" }
        assertEquals(2, kokoro.size)
        val dora = kokoro.first { it.id == "kokoro-es-dora" }
        val alex = kokoro.first { it.id == "kokoro-es-alex" }
        assertEquals(28, dora.speakerId)
        assertEquals(29, alex.speakerId)
        assertEquals("female", dora.gender)
        assertEquals("male", alex.gender)
        assertEquals(dora.installId(), alex.installId())
        assertEquals("kokoro-multi-lang-v1_0", dora.packageId)
        assertTrue(dora.downloadUrl.endsWith("kokoro-multi-lang-v1_0.tar.bz2"))
        assertEquals(
            "c133d26353d776da730870dac7da07dbfc9a5e3bc80cc5e8e83ab6e823be7046",
            dora.sha256,
        )
        assertFalse(dora.downloadUrl.contains("int8"))
        assertEquals(2, VoiceCatalog.siblings(voices, dora).size)
    }

    @Test
    fun resolveEntry_legacyPackageIdsMapToDora() {
        val entries = VoiceCatalog.parse(
            File("src/main/assets/voice_catalog.json").readText(),
        )
        assertEquals(
            "kokoro-es-dora",
            VoiceCatalog.resolveEntry(entries, "kokoro-multi-lang-v1_0")!!.id,
        )
        assertEquals(
            "kokoro-es-dora",
            VoiceCatalog.resolveEntry(entries, "kokoro-multi-lang-v1_1")!!.id,
        )
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
