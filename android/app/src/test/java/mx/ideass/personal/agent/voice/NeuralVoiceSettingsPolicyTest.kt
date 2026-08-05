package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NeuralVoiceSettingsPolicyTest {

    private fun entry(
        id: String,
        recommended: Boolean = false,
        engine: String = "piper",
    ) = VoiceCatalogEntry(
        id = id,
        displayName = id,
        engine = engine,
        language = "es-MX",
        sampleRate = 22050,
        sizeBytes = 1_000_000,
        recommended = recommended,
        downloadUrl = "https://example.com/$id.tar.bz2",
        sha256 = "aa",
        archiveRoot = id,
        onnxFile = "model.onnx",
    )

    @Test
    fun buildRows_marksActiveInstalledDownloading() {
        val catalog = listOf(
            entry("a", recommended = true),
            entry("b"),
            entry("c", engine = "kokoro"),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf("a" to 10L, "b" to 20L),
            activeVoiceId = "a",
            downloadStatuses = mapOf(
                "c" to VoiceDownloadStatus.Downloading(50, 100),
            ),
        )
        assertEquals(NeuralVoiceRowKind.Active, rows[0].kind)
        assertEquals(NeuralVoiceRowKind.Installed, rows[1].kind)
        assertEquals(NeuralVoiceRowKind.Downloading, rows[2].kind)
        assertEquals(0.5f, rows[2].progressFraction!!, 0.001f)
        assertEquals("Kokoro", NeuralVoiceSettingsPolicy.engineLabel("kokoro"))
    }

    @Test
    fun buildRows_failedAndExtracting() {
        val catalog = listOf(entry("x"), entry("y"))
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = emptyMap(),
            activeVoiceId = null,
            downloadStatuses = mapOf(
                "x" to VoiceDownloadStatus.Failed("boom"),
                "y" to VoiceDownloadStatus.Extracting,
            ),
        )
        assertEquals(NeuralVoiceRowKind.Failed, rows[0].kind)
        assertEquals("boom", rows[0].errorMessage)
        assertEquals(NeuralVoiceRowKind.Extracting, rows[1].kind)
        assertNull(rows[1].progressFraction)
        assertTrue(rows[0].kind == NeuralVoiceRowKind.Failed)
    }
}
