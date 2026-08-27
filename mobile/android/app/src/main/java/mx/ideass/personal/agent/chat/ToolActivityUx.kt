package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.capabilities.AgentCapabilityUx

/**
 * Estados de ejecución de Tools en el hilo (PHASE 42). Solo presentación;
 * no duplica Runtime ni policy.
 */
enum class ToolActivityPhase {
    Preparing,
    AwaitingAuth,
    Executing,
    Completed,
    Failed,
}

data class ToolActivityState(
    val conversationId: String,
    val phase: ToolActivityPhase,
    val toolName: String?,
    val capabilityLabel: String?,
    val platformNote: String? = null,
)

object ToolActivityUx {

    fun statusLabel(phase: ToolActivityPhase): String = when (phase) {
        ToolActivityPhase.Preparing -> "Preparando acción…"
        ToolActivityPhase.AwaitingAuth -> "Esperando autorización…"
        ToolActivityPhase.Executing -> "Ejecutando…"
        ToolActivityPhase.Completed -> "Acción completada"
        ToolActivityPhase.Failed -> "No se pudo completar la acción"
    }

    fun excelWindowsNote(toolName: String?): String? =
        if (toolName?.startsWith("office.excel.") == true) {
            "Esta capacidad requiere que el agente esté ejecutándose en Windows."
        } else {
            null
        }

    fun capabilityLabel(toolName: String?): String? =
        toolName?.let { AgentCapabilityUx.labelFor(it) }

    private fun buildState(
        conversationId: String,
        phase: ToolActivityPhase,
        toolName: String?,
    ): ToolActivityState = ToolActivityState(
        conversationId = conversationId,
        phase = phase,
        toolName = toolName,
        capabilityLabel = capabilityLabel(toolName),
        platformNote = excelWindowsNote(toolName),
    )

    /**
     * Resuelve el estado visible en conversación. Devuelve null cuando el hilo
     * ya muestra narrativa del asistente (streaming) o no hay trabajo en vuelo.
     */
    fun resolveVisible(
        conversationId: String,
        hasPendingReply: Boolean,
        hasStreaming: Boolean,
        pendingConfirmForConversation: Boolean,
        executingToolName: String?,
        forcedPhase: ToolActivityPhase? = null,
    ): ToolActivityState? {
        if (conversationId.isBlank()) return null
        if (hasStreaming) return null

        if (forcedPhase == ToolActivityPhase.Failed) {
            return buildState(conversationId, ToolActivityPhase.Failed, executingToolName)
        }

        val phase = when {
            pendingConfirmForConversation -> ToolActivityPhase.AwaitingAuth
            forcedPhase == ToolActivityPhase.Completed -> ToolActivityPhase.Completed
            executingToolName != null && hasPendingReply -> ToolActivityPhase.Executing
            hasPendingReply -> ToolActivityPhase.Preparing
            forcedPhase != null -> forcedPhase
            else -> return null
        }

        val toolName = executingToolName

        return buildState(conversationId, phase, toolName)
    }

    fun stateForConfirmRequest(
        conversationId: String,
        toolName: String,
    ): ToolActivityState = buildState(
        conversationId,
        ToolActivityPhase.AwaitingAuth,
        toolName,
    )

    fun stateAfterConfirmResponse(
        conversationId: String,
        toolName: String,
        approved: Boolean,
    ): ToolActivityState = if (approved) {
        buildState(conversationId, ToolActivityPhase.Executing, toolName)
    } else {
        buildState(conversationId, ToolActivityPhase.Failed, toolName)
    }
}
