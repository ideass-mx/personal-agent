package mx.ideass.personal.agent.voice

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.gateway.client.GatewayClient
import mx.ideass.personal.agent.gateway.session.KnownSession
import mx.ideass.personal.agent.gateway.session.SessionProvider
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Abre una racha de voz: una sesión Gateway nueva por invocación,
 * sin cambiar la sesión activa de la UI.
 *
 * TODO(Fase 2): enrutado a sesión activa / anuncio auditivo.
 */
@Singleton
class VoiceStreak @Inject constructor(
    @ApplicationContext private val context: Context,
    private val gatewayClient: GatewayClient,
    private val sessionProvider: SessionProvider,
) {
    data class Opened(
        val session: KnownSession,
        /** Nombre provisional asignado al crear (para rename no-destructivo). */
        val provisionalName: String,
    )

    fun provisionalName(nowMs: Long = System.currentTimeMillis()): String {
        val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(nowMs))
        return VoiceStreakNames.formatProvisional(
            template = context.getString(R.string.session_voice_streak_provisional),
            hourMinute = time,
        )
    }

    /**
     * Crea la sesión de la racha. El caller debe haber pasado por
     * [VoiceConnectionGate.ensureConnected]; aquí no se anuncia offline.
     * Nunca inventa sessionKey local. Nunca activa la sesión en la UI.
     */
    suspend fun open(): Opened? {
        val activeBefore = sessionProvider.activeSession.value
        val name = provisionalName()
        val created = gatewayClient.createNamedSession(name, activate = false) ?: return null
        check(sessionProvider.activeSession.value == activeBefore) {
            "voice_streak_must_not_change_active"
        }
        return Opened(session = created, provisionalName = name)
    }
}

/** Formato del nombre provisional (testeable sin Android). */
object VoiceStreakNames {
    fun formatProvisional(template: String, hourMinute: String): String =
        template.replace("%1\$s", hourMinute).replace("%s", hourMinute)
}
