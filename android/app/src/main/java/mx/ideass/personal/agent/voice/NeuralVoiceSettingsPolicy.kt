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
)

object NeuralVoiceSettingsPolicy {

    fun buildRows(
        catalog: List<VoiceCatalogEntry>,
        installedById: Map<String, Long>,
        activeVoiceId: String?,
        downloadStatuses: Map<String, VoiceDownloadStatus>,
    ): List<NeuralVoiceRowModel> {
        return catalog.map { entry ->
            val status = downloadStatuses[entry.id] ?: VoiceDownloadStatus.Idle
            val installed = installedById.containsKey(entry.id)
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
            NeuralVoiceRowModel(
                entry = entry,
                kind = kind,
                progressFraction = (status as? VoiceDownloadStatus.Downloading)?.progressFraction,
                errorMessage = (status as? VoiceDownloadStatus.Failed)?.message,
                bytesOnDisk = installedById[entry.id] ?: 0L,
            )
        }
    }

    fun engineLabel(engine: String): String = when (engine.lowercase()) {
        "kokoro" -> "Kokoro"
        "piper" -> "Piper"
        else -> engine
    }
}
