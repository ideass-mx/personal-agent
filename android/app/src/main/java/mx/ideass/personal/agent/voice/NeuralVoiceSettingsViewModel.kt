package mx.ideass.personal.agent.voice

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
                val installedById = installed.associate { it.id to it.bytesOnDisk }
                NeuralVoiceSettingsUi(
                    rows = NeuralVoiceSettingsPolicy.buildRows(
                        catalog = catalog.entries,
                        installedById = installedById,
                        activeVoiceId = activeId,
                        downloadStatuses = statuses,
                    ),
                    activeVoiceId = activeId,
                    previewingVoiceId = previewing,
                    statusMessage = message,
                    statusWarn = _statusWarn.value,
                )
            }.collect { state ->
                _ui.value = state.copy(statusWarn = _statusWarn.value)
            }
        }
        viewModelScope.launch {
            _statusWarn.collect { warn ->
                _ui.update { it.copy(statusWarn = warn) }
            }
        }
    }

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

    fun refresh() {
        installedVoices.reconcile()
        setStatus(null, warn = false)
    }

    private fun setStatus(message: String?, warn: Boolean) {
        _statusMessage.value = message
        _statusWarn.value = warn
    }
}
