package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Params de `sessions.list` (`SessionsListParamsSchema`). */
@Serializable
data class SessionsListParams(
    val limit: Int? = null,
    val offset: Int? = null,
    val activeMinutes: Int? = null,
    val includeGlobal: Boolean? = null,
    val includeUnknown: Boolean? = null,
    val configuredAgentsOnly: Boolean? = null,
    val includeDerivedTitles: Boolean? = null,
    val includeLastMessage: Boolean? = null,
    val label: String? = null,
    val spawnedBy: String? = null,
    val agentId: String? = null,
    val search: String? = null,
    val archived: Boolean? = null,
)

/** Params de `sessions.resolve` (`SessionsResolveParamsSchema`). */
@Serializable
data class SessionsResolveParams(
    val key: String? = null,
    val sessionId: String? = null,
    val label: String? = null,
    val agentId: String? = null,
    val spawnedBy: String? = null,
    val includeGlobal: Boolean? = null,
    val includeUnknown: Boolean? = null,
    val allowMissing: Boolean? = null,
)

/** Params de `sessions.create` (`SessionsCreateParamsSchema`). */
@Serializable
data class SessionsCreateParams(
    val key: String? = null,
    val agentId: String? = null,
    val label: String? = null,
    val model: String? = null,
    val parentSessionKey: String? = null,
    val fork: Boolean? = null,
    val emitCommandHooks: Boolean? = null,
    val task: String? = null,
    val message: String? = null,
    val worktree: Boolean? = null,
)

@Serializable
data class SessionWorktreeInfo(
    val id: String,
    val path: String,
    val branch: String,
)

/** Resultado de `sessions.create` (`SessionsCreateResultSchema`). */
@Serializable
data class SessionsCreateResult(
    val ok: Boolean = true,
    val key: String,
    val sessionId: String? = null,
    val entry: Map<String, JsonElement>? = null,
    val runStarted: Boolean? = null,
    val worktree: SessionWorktreeInfo? = null,
)

/** Params de `sessions.patch` — subset de enrutamiento usado por el cliente. */
@Serializable
data class SessionsPatchParams(
    val key: String,
    val agentId: String? = null,
    val label: String? = null,
    val category: String? = null,
    val archived: Boolean? = null,
    val pinned: Boolean? = null,
    val unread: Boolean? = null,
)

/** Params de `sessions.messages.subscribe`. */
@Serializable
data class SessionsMessagesSubscribeParams(
    val key: String,
    val agentId: String? = null,
)

/** Params de `sessions.messages.unsubscribe`. */
@Serializable
data class SessionsMessagesUnsubscribeParams(
    val key: String,
    val agentId: String? = null,
)
