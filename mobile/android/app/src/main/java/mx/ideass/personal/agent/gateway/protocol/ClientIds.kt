package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Ids de cliente cerrados del protocolo gateway legacy (`GATEWAY_CLIENT_IDS`).
 * Para Android operator/node usar [ANDROID].
 */
@Serializable
enum class GatewayClientId {
    @SerialName("webchat-ui")
    WEBCHAT_UI,

    @SerialName("openclaw-control-ui")
    CONTROL_UI,

    @SerialName("openclaw-tui")
    TUI,

    @SerialName("webchat")
    WEBCHAT,

    @SerialName("cli")
    CLI,

    @SerialName("gateway-client")
    GATEWAY_CLIENT,

    @SerialName("openclaw-macos")
    MACOS_APP,

    @SerialName("openclaw-ios")
    IOS_APP,

    /** Valor de wire del enum cerrado del protocolo legacy; no renombrar en el cable. */
    @SerialName("openclaw-android")
    ANDROID,

    @SerialName("node-host")
    NODE_HOST,

    @SerialName("test")
    TEST,

    @SerialName("fingerprint")
    FINGERPRINT,

    @SerialName("openclaw-probe")
    PROBE,
}

/**
 * Modos de cliente cerrados (`GATEWAY_CLIENT_MODES` en el tag).
 * El rol operator/node va en `ConnectParams.role`, no aquí.
 */
@Serializable
enum class GatewayClientMode {
    @SerialName("webchat")
    WEBCHAT,

    @SerialName("cli")
    CLI,

    @SerialName("ui")
    UI,

    @SerialName("backend")
    BACKEND,

    @SerialName("node")
    NODE,

    @SerialName("probe")
    PROBE,

    @SerialName("test")
    TEST,
}
