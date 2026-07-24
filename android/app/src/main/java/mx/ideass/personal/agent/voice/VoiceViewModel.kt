package mx.ideass.personal.agent.voice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class VoiceViewModel @Inject constructor(
    private val voiceSession: VoiceSession,
) : ViewModel() {

    val ui: StateFlow<VoiceSessionUi> = voiceSession.ui
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), VoiceSessionUi())

    val state: StateFlow<VoiceState> = voiceSession.state
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), VoiceState.Idle)

    fun startSession() = voiceSession.start()

    fun endSession() = voiceSession.stop()

    override fun onCleared() {
        voiceSession.stop()
        super.onCleared()
    }
}
