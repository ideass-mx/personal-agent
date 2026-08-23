package mx.ideass.personal.agent.voice

/**
 * Estado de una fila del catálogo neuronal (puro, testeable).
 */
enum class NeuralVoiceRowKind {
    NotInstalled,
    Downloading,
    Extracting,
    Failed,
    Installed,
    Active,
}

data class NeuralVoiceRowModel(
    val entry: VoiceCatalogEntry,
    val kind: NeuralVoiceRowKind,
    /** 0..1 si [kind] == Downloading; null si desconocido. */
    val progressFraction: Float? = null,
    val errorMessage: String? = null,
    val bytesOnDisk: Long = 0L,
    /**
     * Voces hermanas del mismo paquete (Kokoro / Supertonic). Si hay más de
     * una, la UI muestra selectores compactos en lugar de N filas.
     */
    val groupEntries: List<VoiceCatalogEntry> = emptyList(),
) {
    val isGrouped: Boolean get() = groupEntries.size > 1
}

object NeuralVoiceSettingsPolicy {

    fun buildRows(
        catalog: List<VoiceCatalogEntry>,
        installedById: Map<String, Long>,
        activeVoiceId: String?,
        downloadStatuses: Map<String, VoiceDownloadStatus>,
        /** Selección borrador por packageId; si falta, usa activa o default. */
        draftVoiceIdByPackage: Map<String, String> = emptyMap(),
    ): List<NeuralVoiceRowModel> {
        val (groupedEngines, singles) = catalog.partition {
            it.engineType() == NeuralVoiceEngine.Supertonic ||
                it.engineType() == NeuralVoiceEngine.Kokoro
        }
        val rows = ArrayList<NeuralVoiceRowModel>(singles.size + 4)
        for (entry in singles) {
            rows.add(rowFor(entry, installedById, activeVoiceId, downloadStatuses))
        }
        // Una tarjeta por packageId (speaker × idioma vía selectores).
        for ((_, siblings) in groupedEngines.groupBy { it.installId() }) {
            if (siblings.isEmpty()) continue
            val sorted = siblings.sortedWith(groupSort)
            val pkg = sorted.first().installId()
            val draftId = draftVoiceIdByPackage[pkg]
            val selected = sorted.firstOrNull { it.id == draftId }
                ?: sorted.firstOrNull { it.id == activeVoiceId }
                ?: defaultGroupedSelection(sorted)
            val base = rowFor(selected, installedById, activeVoiceId, downloadStatuses)
            val installed = isInstalled(selected, installedById)
            val kind = when {
                base.kind == NeuralVoiceRowKind.Downloading ||
                    base.kind == NeuralVoiceRowKind.Extracting ||
                    base.kind == NeuralVoiceRowKind.Failed ||
                    base.kind == NeuralVoiceRowKind.NotInstalled -> base.kind
                selected.id == activeVoiceId -> NeuralVoiceRowKind.Active
                installed -> NeuralVoiceRowKind.Installed
                else -> NeuralVoiceRowKind.NotInstalled
            }
            rows.add(
                base.copy(
                    entry = selected,
                    kind = kind,
                    groupEntries = sorted,
                ),
            )
        }
        return rows
    }

    /** Orden de idiomas en UI: español primero, luego el resto alfabético. */
    private val langUiOrder = listOf(
        "es", "en-us", "en-gb", "pt-br", "fr", "it", "ja", "zh", "hi",
    )

    private val groupSort = compareBy<VoiceCatalogEntry> { entry ->
        val idx = langUiOrder.indexOfFirst { it.equals(entry.language, ignoreCase = true) }
        if (idx >= 0) idx else langUiOrder.size
    }.thenBy { it.language.lowercase() }.thenBy { it.speakerId }

    private fun defaultGroupedSelection(sorted: List<VoiceCatalogEntry>): VoiceCatalogEntry {
        val engine = sorted.first().engineType()
        return when (engine) {
            NeuralVoiceEngine.Kokoro ->
                sorted.firstOrNull {
                    it.language.equals("es", ignoreCase = true) &&
                        it.speakerId == KokoroVoices.DEFAULT_SID
                } ?: sorted.firstOrNull { it.language.equals("es", ignoreCase = true) }
                    ?: sorted.first()
            NeuralVoiceEngine.Supertonic ->
                sorted.firstOrNull {
                    it.language.equals("es", ignoreCase = true) && it.speakerId == 0
                } ?: sorted.first()
            else -> sorted.first()
        }
    }

    private fun rowFor(
        entry: VoiceCatalogEntry,
        installedById: Map<String, Long>,
        activeVoiceId: String?,
        downloadStatuses: Map<String, VoiceDownloadStatus>,
    ): NeuralVoiceRowModel {
        val status = statusFor(entry, downloadStatuses)
        val installed = isInstalled(entry, installedById)
        val kind = when (status) {
            is VoiceDownloadStatus.Downloading -> NeuralVoiceRowKind.Downloading
            VoiceDownloadStatus.Extracting -> NeuralVoiceRowKind.Extracting
            is VoiceDownloadStatus.Failed -> NeuralVoiceRowKind.Failed
            VoiceDownloadStatus.Idle -> when {
                installed && entry.id == activeVoiceId -> NeuralVoiceRowKind.Active
                installed -> NeuralVoiceRowKind.Installed
                else -> NeuralVoiceRowKind.NotInstalled
            }
        }
        return NeuralVoiceRowModel(
            entry = entry,
            kind = kind,
            progressFraction = (status as? VoiceDownloadStatus.Downloading)?.progressFraction,
            errorMessage = (status as? VoiceDownloadStatus.Failed)?.message,
            bytesOnDisk = bytesOnDisk(entry, installedById),
        )
    }

    fun isInstalled(entry: VoiceCatalogEntry, installedById: Map<String, Long>): Boolean =
        installedById.containsKey(entry.installId()) || installedById.containsKey(entry.id)

    fun bytesOnDisk(entry: VoiceCatalogEntry, installedById: Map<String, Long>): Long =
        installedById[entry.installId()]
            ?: installedById[entry.id]
            ?: 0L

    fun statusFor(
        entry: VoiceCatalogEntry,
        downloadStatuses: Map<String, VoiceDownloadStatus>,
    ): VoiceDownloadStatus =
        downloadStatuses[entry.id]
            ?: downloadStatuses[entry.installId()]
            ?: VoiceDownloadStatus.Idle

    fun engineLabel(engine: String): String = when (engine.lowercase()) {
        "kokoro" -> "Kokoro"
        "piper" -> "Piper"
        "supertonic" -> "Supertonic"
        else -> engine
    }

    fun langLabel(entry: VoiceCatalogEntry): String =
        langLabel(entry.engineType(), entry.language)

    fun langLabel(engine: NeuralVoiceEngine, code: String): String = when (engine) {
        NeuralVoiceEngine.Kokoro -> KokoroVoices.langLabel(code)
        NeuralVoiceEngine.Supertonic -> SupertonicVoices.langLabel(code)
        else -> code
    }

    fun speakerLabel(entry: VoiceCatalogEntry): String = when (entry.engineType()) {
        NeuralVoiceEngine.Kokoro -> KokoroVoices.speakerLabel(entry.speakerId)
        NeuralVoiceEngine.Supertonic -> SupertonicVoices.speakerCode(entry.speakerId)
        else -> "S${entry.speakerId}"
    }
}
