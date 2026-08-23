package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement

@Serializable
enum class InputProvenanceKind {
    @SerialName("external_user")
    EXTERNAL_USER,

    @SerialName("inter_session")
    INTER_SESSION,

    @SerialName("internal_system")
    INTERNAL_SYSTEM,
}

@Serializable
data class InputProvenance(
    val kind: InputProvenanceKind,
    val originSessionId: String? = null,
    val sourceSessionKey: String? = null,
    val sourceChannel: String? = null,
    val sourceTool: String? = null,
)

/** Params de `chat.history` — distintos de `chat.send`. */
@Serializable
data class ChatHistoryParams(
    val sessionKey: String,
    val agentId: String? = null,
    val limit: Int? = null,
    val offset: Int? = null,
    val maxChars: Int? = null,
)

@Serializable
data class ChatMetadataParams(
    val agentId: String? = null,
)

@Serializable
data class ChatMessageGetParams(
    val sessionKey: String,
    val agentId: String? = null,
    val messageId: String,
    val maxChars: Int? = null,
)

@Serializable
enum class ChatMessageUnavailableReason {
    @SerialName("not_found")
    NOT_FOUND,

    @SerialName("oversized")
    OVERSIZED,

    @SerialName("not_visible")
    NOT_VISIBLE,
}

@Serializable
data class ChatMessageGetResult(
    val ok: Boolean,
    val message: JsonElement? = null,
    val unavailableReason: ChatMessageUnavailableReason? = null,
)

/**
 * Params de `chat.send`.
 * `idempotencyKey` es obligatorio en el schema del tag.
 * `fastMode` es `boolean | "auto"` → [JsonElement] para 1:1 con el wire.
 */
@Serializable
data class ChatSendParams(
    val sessionKey: String,
    val agentId: String? = null,
    val sessionId: String? = null,
    val message: String,
    val thinking: String? = null,
    val fastMode: JsonElement? = null,
    val fastAutoOnSeconds: Int? = null,
    val deliver: Boolean? = null,
    val originatingChannel: String? = null,
    val originatingTo: String? = null,
    val originatingAccountId: String? = null,
    val originatingThreadId: String? = null,
    val attachments: List<JsonElement>? = null,
    val timeoutMs: Long? = null,
    val systemInputProvenance: InputProvenance? = null,
    val systemProvenanceReceipt: String? = null,
    val suppressCommandInterpretation: Boolean? = null,
    val expectedSessionRoutingContract: String? = null,
    val idempotencyKey: String,
)

@Serializable
data class ChatAbortParams(
    val sessionKey: String,
    val agentId: String? = null,
    val runId: String? = null,
    val preserveSideRuns: Boolean? = null,
)

@Serializable
data class ChatInjectParams(
    val sessionKey: String,
    val agentId: String? = null,
    val message: String,
    val label: String? = null,
)

@Serializable
enum class ChatEventErrorKind {
    @SerialName("refusal")
    REFUSAL,

    @SerialName("timeout")
    TIMEOUT,

    @SerialName("rate_limit")
    RATE_LIMIT,

    @SerialName("context_length")
    CONTEXT_LENGTH,

    @SerialName("unknown")
    UNKNOWN,
}

/**
 * Evento de stream de chat (`ChatEventSchema`).
 * Discriminador de wire: `state` (no `type`).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("state")
sealed interface ChatEvent {
    val runId: String
    val sessionKey: String
    val agentId: String?
    val spawnedBy: String?
    val seq: Long

    @Serializable
    @SerialName("delta")
    data class Delta(
        override val runId: String,
        override val sessionKey: String,
        override val agentId: String? = null,
        override val spawnedBy: String? = null,
        override val seq: Long,
        val message: JsonElement? = null,
        val deltaText: String,
        val replace: Boolean? = null,
        val usage: JsonElement? = null,
    ) : ChatEvent

    @Serializable
    @SerialName("final")
    data class Final(
        override val runId: String,
        override val sessionKey: String,
        override val agentId: String? = null,
        override val spawnedBy: String? = null,
        override val seq: Long,
        val message: JsonElement? = null,
        val usage: JsonElement? = null,
        val stopReason: String? = null,
    ) : ChatEvent

    @Serializable
    @SerialName("aborted")
    data class Aborted(
        override val runId: String,
        override val sessionKey: String,
        override val agentId: String? = null,
        override val spawnedBy: String? = null,
        override val seq: Long,
        val message: JsonElement? = null,
        val errorMessage: String? = null,
        val stopReason: String? = null,
    ) : ChatEvent

    @Serializable
    @SerialName("error")
    data class Error(
        override val runId: String,
        override val sessionKey: String,
        override val agentId: String? = null,
        override val spawnedBy: String? = null,
        override val seq: Long,
        val message: JsonElement? = null,
        val errorMessage: String? = null,
        val errorKind: ChatEventErrorKind? = null,
        val usage: JsonElement? = null,
        val stopReason: String? = null,
    ) : ChatEvent
}
