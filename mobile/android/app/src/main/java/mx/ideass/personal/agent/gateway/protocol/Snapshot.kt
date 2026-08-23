package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Entrada de presencia (`PresenceEntrySchema`). */
@Serializable
data class PresenceEntry(
    val host: String? = null,
    val ip: String? = null,
    val version: String? = null,
    val platform: String? = null,
    val deviceFamily: String? = null,
    val modelIdentifier: String? = null,
    val mode: String? = null,
    val lastInputSeconds: Long? = null,
    val reason: String? = null,
    val tags: List<String>? = null,
    val text: String? = null,
    val ts: Long,
    val deviceId: String? = null,
    val roles: List<String>? = null,
    val scopes: List<String>? = null,
    val instanceId: String? = null,
)

/** Defaults de sesión en el snapshot (`SessionDefaultsSchema`). */
@Serializable
data class SessionDefaults(
    val defaultAgentId: String,
    val mainKey: String,
    val mainSessionKey: String,
    val scope: String? = null,
)

@Serializable
data class UpdateAvailable(
    val currentVersion: String,
    val latestVersion: String,
    val channel: String,
)

/**
 * Snapshot inicial / incremental (`SnapshotSchema`).
 * `health` es opaco en el contrato.
 */
@Serializable
data class Snapshot(
    val presence: List<PresenceEntry>,
    val health: JsonElement,
    val stateVersion: StateVersion,
    val uptimeMs: Long,
    val configPath: String? = null,
    val stateDir: String? = null,
    val sessionDefaults: SessionDefaults? = null,
    val authMode: GatewayAuthMode? = null,
    val updateAvailable: UpdateAvailable? = null,
)

@Serializable
enum class GatewayAuthMode {
    @SerialName("none")
    NONE,

    @SerialName("token")
    TOKEN,

    @SerialName("password")
    PASSWORD,

    @SerialName("trusted-proxy")
    TRUSTED_PROXY,
}
