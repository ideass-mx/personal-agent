package mx.ideass.personal.agent.voice

/** Estados explícitos de la sesión de voz (half-duplex). */
sealed interface VoiceState {
    data object Idle : VoiceState
    data object Listening : VoiceState
    data object Thinking : VoiceState
    data object Speaking : VoiceState
}
