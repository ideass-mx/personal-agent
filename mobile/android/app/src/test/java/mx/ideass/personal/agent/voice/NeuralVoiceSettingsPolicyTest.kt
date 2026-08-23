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
        // Un solo Kokoro → fila agrupable con 1 hermana (no isGrouped).
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

    @Test
    fun buildRows_kokoro_collapsesToOneGroupedRow() {
        val catalog = listOf(
            entry("kokoro-es-dora", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 28,
                language = "es",
                archiveRoot = KokoroVoices.PACKAGE_ID,
                displayName = "Kokoro — Dora · Español",
            ),
            entry("kokoro-es-alex", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 29,
                language = "es",
                archiveRoot = KokoroVoices.PACKAGE_ID,
                displayName = "Kokoro — Alex · Español",
            ),
            entry("kokoro-en-us-alloy", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 0,
                language = "en-us",
                archiveRoot = KokoroVoices.PACKAGE_ID,
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf(KokoroVoices.PACKAGE_ID to 349_000_000L),
            activeVoiceId = "kokoro-es-alex",
            downloadStatuses = emptyMap(),
        )
        assertEquals(1, rows.size)
        val row = rows[0]
        assertTrue(row.isGrouped)
        assertEquals(3, row.groupEntries.size)
        assertEquals(NeuralVoiceRowKind.Active, row.kind)
        assertEquals("kokoro-es-alex", row.entry.id)
        assertEquals(349_000_000L, row.bytesOnDisk)
    }

    @Test
    fun buildRows_kokoro_defaultSelectionIsDora() {
        val catalog = listOf(
            entry("kokoro-en-us-alloy", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 0,
                language = "en-us",
            ),
            entry("kokoro-es-dora", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 28,
                language = "es",
            ),
            entry("kokoro-es-alex", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 29,
                language = "es",
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf(KokoroVoices.PACKAGE_ID to 1L),
            activeVoiceId = null,
            downloadStatuses = emptyMap(),
        )
        assertEquals("kokoro-es-dora", rows[0].entry.id)
    }

    @Test
    fun buildRows_kokoro_downloadStatusPropagates() {
        val catalog = listOf(
            entry("kokoro-es-dora", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 28,
                language = "es",
            ),
            entry("kokoro-es-alex", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 29,
                language = "es",
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = emptyMap(),
            activeVoiceId = null,
            downloadStatuses = mapOf(
                KokoroVoices.PACKAGE_ID to VoiceDownloadStatus.Downloading(10, 100),
            ),
        )
        assertEquals(1, rows.size)
        assertEquals(NeuralVoiceRowKind.Downloading, rows[0].kind)
    }

    @Test
    fun buildRows_kokoro_draftOverridesSelection() {
        val catalog = listOf(
            entry("kokoro-es-dora", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 28,
                language = "es",
            ),
            entry("kokoro-es-alex", engine = "kokoro").copy(
                packageId = KokoroVoices.PACKAGE_ID,
                speakerId = 29,
                language = "es",
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf(KokoroVoices.PACKAGE_ID to 1L),
            activeVoiceId = "kokoro-es-dora",
            downloadStatuses = emptyMap(),
            draftVoiceIdByPackage = mapOf(KokoroVoices.PACKAGE_ID to "kokoro-es-alex"),
        )
        assertEquals(1, rows.size)
        assertEquals("kokoro-es-alex", rows[0].entry.id)
        assertEquals(NeuralVoiceRowKind.Installed, rows[0].kind)
    }

    @Test
    fun buildRows_supertonic_collapsesToOneGroupedRow() {
        val pkg = SupertonicVoices.PACKAGE_ID
        val catalog = listOf(
            entry("piper-a"),
            entry("supertonic-v3-es-f1", engine = "supertonic").copy(
                packageId = pkg,
                archiveRoot = pkg,
                speakerId = 0,
                language = "es",
                displayName = "Supertonic — F1 · Español",
            ),
            entry("supertonic-v3-es-m1", engine = "supertonic").copy(
                packageId = pkg,
                archiveRoot = pkg,
                speakerId = 5,
                language = "es",
                displayName = "Supertonic — M1 · Español",
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf(pkg to 129_000_000L),
            activeVoiceId = "supertonic-v3-es-m1",
            downloadStatuses = emptyMap(),
        )
        assertEquals(2, rows.size)
        assertEquals("piper-a", rows[0].entry.id)
        val superRow = rows[1]
        assertTrue(superRow.isGrouped)
        assertEquals(2, superRow.groupEntries.size)
        assertEquals(NeuralVoiceRowKind.Active, superRow.kind)
        assertEquals("supertonic-v3-es-m1", superRow.entry.id)
        assertEquals(129_000_000L, superRow.bytesOnDisk)
    }

    @Test
    fun buildRows_supertonic_draftOverridesSelection() {
        val pkg = SupertonicVoices.PACKAGE_ID
        val catalog = listOf(
            entry("supertonic-v3-es-f1", engine = "supertonic").copy(
                packageId = pkg,
                speakerId = 0,
                language = "es",
            ),
            entry("supertonic-v3-es-m1", engine = "supertonic").copy(
                packageId = pkg,
                speakerId = 5,
                language = "es",
            ),
        )
        val rows = NeuralVoiceSettingsPolicy.buildRows(
            catalog = catalog,
            installedById = mapOf(pkg to 1L),
            activeVoiceId = "supertonic-v3-es-f1",
            downloadStatuses = emptyMap(),
            draftVoiceIdByPackage = mapOf(pkg to "supertonic-v3-es-m1"),
        )
        assertEquals(1, rows.size)
        assertEquals("supertonic-v3-es-m1", rows[0].entry.id)
        // Activa solo si la combinación seleccionada es la activa; si no, Installed + Activar.
        assertEquals(NeuralVoiceRowKind.Installed, rows[0].kind)
    }
}
