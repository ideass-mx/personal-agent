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
    fun assetCatalog_kokoroSpeakersShareV1_0Package() {
        val voices = VoiceCatalog.parse(
            File("src/main/assets/voice_catalog.json").readText(),
        )
        val kokoro = voices.filter { it.engine == "kokoro" }
        assertEquals(53, kokoro.size)
        assertEquals(KokoroVoices.SPEAKERS.size, kokoro.size)
        val dora = kokoro.first { it.id == "kokoro-es-dora" }
        val alex = kokoro.first { it.id == "kokoro-es-alex" }
        assertEquals(28, dora.speakerId)
        assertEquals(29, alex.speakerId)
        assertEquals("female", dora.gender)
        assertEquals("male", alex.gender)
        assertEquals("Kokoro — Dora · Español", dora.displayName)
        assertEquals("Kokoro — Alex · Español", alex.displayName)
        assertEquals(dora.installId(), alex.installId())
        assertEquals(KokoroVoices.PACKAGE_ID, dora.packageId)
        assertTrue(dora.downloadUrl.endsWith("kokoro-multi-lang-v1_0.tar.bz2"))
        assertEquals(KokoroVoices.SHA256, dora.sha256)
        assertFalse(dora.downloadUrl.contains("int8"))
        assertEquals(53, VoiceCatalog.siblings(voices, dora).size)
        // Español completo + principales de otros idiomas.
        assertEquals(2, kokoro.count { it.language == "es" })
        assertEquals(20, kokoro.count { it.language == "en-us" })
        assertEquals(8, kokoro.count { it.language == "en-gb" })
        assertEquals((0..52).toList(), kokoro.map { it.speakerId }.sorted())
        val alloy = kokoro.first { it.id == "kokoro-en-us-alloy" }
        assertEquals(0, alloy.speakerId)
        assertEquals("Kokoro — Alloy · Inglés (US)", alloy.displayName)
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
            if (v.engine.equals("supertonic", ignoreCase = true)) {
                // Supertonic solo existe como int8 en releases oficiales.
                assertTrue(v.downloadUrl.contains("int8"))
                continue
            }
            assertFalse("Catálogo no debe listar Piper/Kokoro int8: ${v.id}", v.id.contains("int8"))
            assertFalse(v.downloadUrl.contains("int8"))
            assertFalse(v.onnxFile.contains("int8"))
        }
    }

    @Test
    fun assetCatalog_supertonicV3Int8Entry() {
        val voices = VoiceCatalog.parse(
            File("src/main/assets/voice_catalog.json").readText(),
        )
        val supers = voices.filter { it.engine == "supertonic" }
        assertEquals(10, supers.size)
        assertTrue(supers.all { it.engineType() == NeuralVoiceEngine.Supertonic })
        assertTrue(supers.all { it.language == "es" })
        assertTrue(supers.all { it.installId() == SupertonicVoices.PACKAGE_ID })
        assertEquals(
            (0..9).toList(),
            supers.map { it.speakerId }.sorted(),
        )
        val f1 = supers.first { it.id == "supertonic-v3-es-f1" }
        assertEquals(0, f1.speakerId)
        assertEquals("female", f1.gender)
        assertEquals(44_100, f1.sampleRate)
        assertEquals(128_774_318L, f1.sizeBytes)
        assertEquals(SupertonicVoices.SHA256, f1.sha256)
        assertEquals(7, f1.requiredFiles.size)
        val m1 = supers.first { it.id == "supertonic-v3-es-m1" }
        assertEquals(5, m1.speakerId)
        assertEquals("male", m1.gender)
        assertEquals("Supertonic — M1 · Español", m1.displayName)
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
