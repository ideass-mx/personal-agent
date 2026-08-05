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
            NeuralVoiceRowModel(
                entry = entry,
                kind = kind,
                progressFraction = (status as? VoiceDownloadStatus.Downloading)?.progressFraction,
                errorMessage = (status as? VoiceDownloadStatus.Failed)?.message,
                bytesOnDisk = bytesOnDisk(entry, installedById),
            )
        }
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
        else -> engine
    }
}
