package mx.ideass.personal.agent.chat

/** Estado de rehidratación History (PHASE 39). No cambia la History API. */
enum class HistoryHydrationStatus {
    Idle,
    Loading,
    Ready,
    Error,
}

data class HistoryHydrationUi(
    val status: HistoryHydrationStatus = HistoryHydrationStatus.Idle,
    val conversationId: String? = null,
)
