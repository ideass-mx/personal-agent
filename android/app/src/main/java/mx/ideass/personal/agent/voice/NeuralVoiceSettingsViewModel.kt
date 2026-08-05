package mx.ideass.personal.agent.voice

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppPreferences
import javax.inject.Inject

data class NeuralVoiceSettingsUi(
    val rows: List<NeuralVoiceRowModel> = emptyList(),
    val activeVoiceId: String? = null,
    val previewingVoiceId: String? = null,
    val statusMessage: String? = null,
    val statusWarn: Boolean = false,
)

@HiltViewModel
class NeuralVoiceSettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val catalog: VoiceCatalog,
    private val installedVoices: InstalledVoices,
    private val downloader: VoiceDownloader,
    private val preferences: AppPreferences,
) : ViewModel() {

    private val _previewing = MutableStateFlow<String?>(null)
    private val _statusMessage = MutableStateFlow<String?>(null)
    private val _statusWarn = MutableStateFlow(false)
    /** Borrador speaker×idioma por packageId (Kokoro / Supertonic). */
    private val _draftByPackage = MutableStateFlow<Map<String, String>>(emptyMap())

    private val _ui = MutableStateFlow(NeuralVoiceSettingsUi())
    val ui: StateFlow<NeuralVoiceSettingsUi> = _ui.asStateFlow()

    private var previewJob: Job? = null
    private val downloadJobs = mutableMapOf<String, Job>()

    init {
        installedVoices.reconcile()
        viewModelScope.launch {
            combine(
                installedVoices.installed,
                preferences.activeNeuralVoiceId,
                downloader.statuses,
                _previewing,
                _statusMessage,
            ) { installed, activeId, statuses, previewing, message ->
                UiParts(installed, activeId, statuses, previewing, message)
            }
                .combine(_draftByPackage) { parts, drafts ->
                    val installedById = parts.installed.associate { it.id to it.bytesOnDisk }
                    NeuralVoiceSettingsUi(
                        rows = NeuralVoiceSettingsPolicy.buildRows(
                            catalog = catalog.entries,
                            installedById = installedById,
                            activeVoiceId = parts.activeId,
                            downloadStatuses = parts.statuses,
                            draftVoiceIdByPackage = drafts,
                        ),
                        activeVoiceId = parts.activeId,
                        previewingVoiceId = parts.previewing,
                        statusMessage = parts.message,
                        statusWarn = _statusWarn.value,
                    )
                }
                .collect { state ->
                    _ui.value = state.copy(statusWarn = _statusWarn.value)
                }
        }
        viewModelScope.launch {
            _statusWarn.collect { warn ->
                _ui.update { it.copy(statusWarn = warn) }
            }
        }
    }

    private data class UiParts(
        val installed: List<InstalledVoice>,
        val activeId: String?,
        val statuses: Map<String, VoiceDownloadStatus>,
        val previewing: String?,
        val message: String?,
    )

    fun download(voiceId: String) {
        if (downloadJobs[voiceId]?.isActive == true) return
        downloadJobs[voiceId] = viewModelScope.launch {
            setStatus(null, warn = false)
            val result = downloader.download(voiceId)
            downloadJobs.remove(voiceId)
            if (result.isSuccess) {
                setStatus(context.getString(R.string.neural_voice_download_ok), warn = false)
            } else {
                val msg = result.exceptionOrNull()?.message
                if (msg != "cancelled") {
                    setStatus(
                        context.getString(R.string.neural_voice_download_failed),
                        warn = true,
                    )
                }
            }
        }
    }

    fun cancelDownload(voiceId: String) {
        downloader.cancel(voiceId)
        downloadJobs[voiceId]?.cancel()
        downloadJobs.remove(voiceId)
    }

    fun activate(voiceId: String) {
        viewModelScope.launch {
            if (!installedVoices.isInstalled(voiceId)) {
                setStatus(context.getString(R.string.neural_voice_not_installed), warn = true)
                return@launch
            }
            preferences.saveActiveNeuralVoiceId(voiceId)
            val model = installedVoices.resolveModel(voiceId)
            if (model != null) {
                setStatus(context.getString(R.string.neural_voice_preparing), warn = false)
                val numThreads = context.resources.getInteger(R.integer.sherpa_tts_num_threads)
                val silenceScale = context.resources.getFloat(R.dimen.sherpa_tts_silence_scale)
                val ok = withContext(Dispatchers.IO) {
                    SherpaOfflineTtsCache.warm(
                        model = model,
                        numThreads = numThreads,
                        silenceScale = silenceScale,
                    )
                }
                if (!ok) {
                    setStatus(context.getString(R.string.neural_voice_prepare_failed), warn = true)
                    return@launch
                }
            }
            setStatus(context.getString(R.string.neural_voice_activated), warn = false)
        }
    }

    fun delete(voiceId: String) {
        viewModelScope.launch {
            downloader.delete(voiceId)
            setStatus(context.getString(R.string.neural_voice_deleted), warn = false)
        }
    }

    fun preview(voiceId: String) {
        previewJob?.cancel()
        previewJob = viewModelScope.launch {
            val model = installedVoices.resolveModel(voiceId)
            if (model == null) {
                setStatus(context.getString(R.string.neural_voice_not_installed), warn = true)
                return@launch
            }
            _previewing.value = voiceId
            setStatus(null, warn = false)
            val ok = NeuralVoicePreview.play(
                context = context,
                model = model,
                sampleText = context.getString(R.string.neural_voice_sample_phrase),
            )
            _previewing.value = null
            if (!ok) {
                setStatus(context.getString(R.string.neural_voice_sample_failed), warn = true)
            }
        }
    }

    /**
     * Cambia la voz seleccionada de un paquete multi-speaker
     * (solo afecta preview/activar; no descarga de nuevo).
     */
    fun selectGroupedVoice(packageId: String, voiceId: String) {
        _draftByPackage.update { it + (packageId to voiceId) }
    }

    fun selectSupertonicCombo(packageId: String, lang: String, sid: Int) {
        val entry = SupertonicVoices.findEntry(catalog.entries, lang, sid) ?: return
        selectGroupedVoice(packageId, entry.id)
    }

    /**
     * Kokoro: el idioma filtra speakers (va embebido en el sid). Si el sid
     * no pertenece al idioma, cae a la primera voz de ese idioma.
     */
    fun selectKokoroCombo(packageId: String, lang: String, sid: Int) {
        val entry = KokoroVoices.findEntry(catalog.entries, lang, sid)
            ?: KokoroVoices.firstEntryForLang(catalog.entries, lang)
            ?: return
        selectGroupedVoice(packageId, entry.id)
    }

    fun refresh() {
        installedVoices.reconcile()
        setStatus(null, warn = false)
    }

    private fun setStatus(message: String?, warn: Boolean) {
        _statusMessage.value = message
        _statusWarn.value = warn
    }
}
