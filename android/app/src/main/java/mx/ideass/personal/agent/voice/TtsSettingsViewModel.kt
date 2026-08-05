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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppPreferences
import javax.inject.Inject

data class TtsSettingsUi(
    val loadingEngines: Boolean = true,
    val loadingVoices: Boolean = false,
    val engines: List<TtsCatalog.EngineInfo> = emptyList(),
    /** null = motor del sistema. */
    val selectedEnginePackage: String? = null,
    val voices: List<TtsVoicePolicy.VoiceInfo> = emptyList(),
    /** null = locale automático del motor. */
    val selectedVoiceName: String? = null,
    val previewingVoiceName: String? = null,
    val statusMessage: String? = null,
    val statusWarn: Boolean = false,
)

@HiltViewModel
class TtsSettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferences: AppPreferences,
) : ViewModel() {

    private val _ui = MutableStateFlow(TtsSettingsUi())
    val ui: StateFlow<TtsSettingsUi> = _ui.asStateFlow()

    private var voicesJob: Job? = null
    private var previewJob: Job? = null

    init {
        viewModelScope.launch {
            val savedEngine = preferences.getTtsEnginePackage()
            val savedVoice = preferences.getTtsVoiceName()
            _ui.update {
                it.copy(
                    selectedEnginePackage = savedEngine,
                    selectedVoiceName = savedVoice,
                )
            }
            reloadEngines()
        }
    }

    fun selectSystemEngine() {
        viewModelScope.launch {
            preferences.saveTtsEnginePackage(null)
            // Al cambiar de motor, la voz previa puede no existir.
            preferences.saveTtsVoiceName(null)
            _ui.update {
                it.copy(
                    selectedEnginePackage = null,
                    selectedVoiceName = null,
                    statusMessage = context.getString(R.string.tts_settings_engine_system_saved),
                    statusWarn = false,
                )
            }
            reloadVoices()
        }
    }

    fun selectEngine(packageName: String) {
        viewModelScope.launch {
            preferences.saveTtsEnginePackage(packageName)
            preferences.saveTtsVoiceName(null)
            _ui.update {
                it.copy(
                    selectedEnginePackage = packageName,
                    selectedVoiceName = null,
                    statusMessage = context.getString(R.string.tts_settings_engine_saved),
                    statusWarn = false,
                )
            }
            reloadVoices()
        }
    }

    fun selectVoice(voiceName: String) {
        viewModelScope.launch {
            preferences.saveTtsVoiceName(voiceName)
            _ui.update {
                it.copy(
                    selectedVoiceName = voiceName,
                    statusMessage = context.getString(R.string.tts_settings_voice_saved),
                    statusWarn = false,
                )
            }
        }
    }

    fun clearVoice() {
        viewModelScope.launch {
            preferences.saveTtsVoiceName(null)
            _ui.update {
                it.copy(
                    selectedVoiceName = null,
                    statusMessage = context.getString(R.string.tts_settings_voice_auto),
                    statusWarn = false,
                )
            }
        }
    }

    fun previewVoice(voiceName: String) {
        previewJob?.cancel()
        previewJob = viewModelScope.launch {
            _ui.update { it.copy(previewingVoiceName = voiceName, statusMessage = null) }
            val ok = TtsCatalog.playSample(
                context = context,
                enginePackage = _ui.value.selectedEnginePackage,
                voiceName = voiceName,
                sampleText = context.getString(R.string.tts_settings_sample_phrase),
            )
            _ui.update {
                it.copy(
                    previewingVoiceName = null,
                    statusMessage = if (ok) {
                        null
                    } else {
                        context.getString(R.string.tts_settings_sample_failed)
                    },
                    statusWarn = !ok,
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch { reloadEngines() }
    }

    private suspend fun reloadEngines() {
        _ui.update { it.copy(loadingEngines = true, statusMessage = null) }
        val engines = TtsCatalog.listEngines(context)
        _ui.update { it.copy(loadingEngines = false, engines = engines) }
        reloadVoices()
    }

    private fun reloadVoices() {
        voicesJob?.cancel()
        voicesJob = viewModelScope.launch {
            _ui.update { it.copy(loadingVoices = true) }
            val enginePkg = _ui.value.selectedEnginePackage
            val voices = TtsCatalog.listVoices(context, enginePkg)
            val selected = _ui.value.selectedVoiceName
            val missing = !selected.isNullOrBlank() && voices.none { it.name == selected }
            if (missing) {
                preferences.saveTtsVoiceName(null)
                _ui.update {
                    it.copy(
                        loadingVoices = false,
                        voices = voices,
                        selectedVoiceName = null,
                        statusMessage = context.getString(R.string.tts_settings_voice_missing),
                        statusWarn = true,
                    )
                }
            } else {
                _ui.update { it.copy(loadingVoices = false, voices = voices) }
            }
        }
    }
}
