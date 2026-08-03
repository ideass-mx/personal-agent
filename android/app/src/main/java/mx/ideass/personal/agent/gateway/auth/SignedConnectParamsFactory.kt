package mx.ideass.personal.agent.gateway.auth

import kotlinx.serialization.encodeToString
import mx.ideass.personal.agent.gateway.client.ConnectParamsFactory
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.ConnectAuth
import mx.ideass.personal.agent.gateway.protocol.ConnectDevice
import mx.ideass.personal.agent.gateway.protocol.ConnectParams
import mx.ideass.personal.agent.gateway.protocol.GatewayClientId
import mx.ideass.personal.agent.gateway.protocol.GatewayClientInfo
import mx.ideass.personal.agent.gateway.protocol.GatewayClientMode
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.GatewayProtocolVersion
import mx.ideass.personal.agent.gateway.protocol.GatewayRoles
import mx.ideass.personal.agent.gateway.protocol.OperatorScopes

/**
 * Construye `ConnectParams` con identidad firmada (payload v3 del tag).
 */
class SignedConnectParamsFactory(
    private val identityStore: DeviceIdentityStore,
    private val tokenStore: DeviceTokenStore,
    private val config: GatewayConfig,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) : ConnectParamsFactory {
    override fun create(nonce: String): ConnectParams {
        val identity = identityStore.loadOrCreate()
        val role = if (config.enableNodeRole) GatewayRoles.NODE else GatewayRoles.OPERATOR
        val mode = if (config.enableNodeRole) GatewayClientMode.NODE else GatewayClientMode.UI
        val scopes = config.scopes.ifEmpty {
            if (config.enableNodeRole) emptyList() else OperatorScopes.CHAT_MINIMAL
        }

        val stored = tokenStore.loadEntry(
            gatewayId = config.gatewayId(),
            deviceId = identity.deviceId,
            role = role,
        )
        val bootstrap = config.bootstrapToken?.trim()?.takeIf { it.isNotEmpty() }
        val sharedToken = config.sharedToken?.trim()?.takeIf { it.isNotEmpty() }
        val password = config.password?.trim()?.takeIf { it.isNotEmpty() }
        val deviceToken = stored?.token?.takeIf { it.isNotEmpty() }
        val effectiveScopes = stored?.scopes?.takeIf { deviceToken != null && it.isNotEmpty() }
            ?: scopes

        // Token incluido en el payload firmado (igual que el cliente del tag).
        val signatureToken = sharedToken ?: bootstrap

        val signedAtMs = clockMs()
        val clientIdWire = wireEnum(GatewayClientId.OPENCLAW_ANDROID)
        val modeWire = wireEnum(mode)
        val payload = DeviceAuthPayload.buildV3(
            deviceId = identity.deviceId,
            clientId = clientIdWire,
            clientMode = modeWire,
            role = role,
            scopes = effectiveScopes,
            signedAtMs = signedAtMs,
            token = signatureToken,
            nonce = nonce,
            platform = config.platform,
            deviceFamily = config.deviceFamily,
        )
        val signature = identityStore.signPayload(payload, identity)

        return ConnectParams(
            minProtocol = GatewayProtocolVersion.CURRENT,
            maxProtocol = GatewayProtocolVersion.CURRENT,
            client = GatewayClientInfo(
                id = GatewayClientId.OPENCLAW_ANDROID,
                displayName = config.clientDisplayName,
                version = config.clientVersion,
                platform = config.platform,
                deviceFamily = config.deviceFamily,
                modelIdentifier = config.modelIdentifier,
                mode = mode,
                instanceId = config.instanceId,
            ),
            role = role,
            scopes = effectiveScopes,
            device = ConnectDevice(
                id = identity.deviceId,
                publicKey = Ed25519DeviceCrypto.publicKeyBase64Url(identity),
                signature = signature,
                signedAt = signedAtMs,
                nonce = nonce,
            ),
            auth = ConnectAuth(
                token = sharedToken,
                bootstrapToken = bootstrap,
                deviceToken = deviceToken,
                password = password,
            ),
            locale = config.locale,
            userAgent = config.userAgent,
        )
    }

    private inline fun <reified T : Enum<T>> wireEnum(value: T): String =
        GatewayJson.encodeToString(value).trim('"')
}
