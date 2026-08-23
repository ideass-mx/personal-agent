package mx.ideass.personal.agent.gateway.session

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.gateway.client.GatewayClient
import javax.inject.Inject
import javax.inject.Singleton

/**
 * LEGADO — ya no lo usa el flujo de voz (sustituido por [mx.ideass.personal.agent.voice.VoiceStreak]).
 * Se conserva la clase y la sesión «Rápidas» existente en catálogo; no borrar.
 *
 * Sesión fija con nombre e id locales en recursos; key del gateway persistida.
 * Garantiza existencia sin cambiar la sesión activa de la UI.
 *
 * TODO: retirar del DI cuando nada más la referencie, o reutilizar si vuelve un
 * destino fijo de voz.
 */
@Singleton
class QuickSession @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionProvider: SessionProvider,
    private val gatewayClient: GatewayClient,
    private val preferences: AppPreferences,
) {
    fun displayName(): String = context.getString(R.string.session_quick_display_name)

    /** Identificador local de marca blanca (no es la sessionKey del gateway). */
    fun localId(): String = context.getString(R.string.session_quick_id)

    /**
     * Devuelve la sesión de voz, creándola en el gateway si aún no existe.
     * Nunca altera [SessionProvider.activeSession].
     */
    suspend fun ensure(): KnownSession? {
        val label = displayName().trim()
        if (label.isEmpty()) return null
        val activeBefore = sessionProvider.activeSession.value

        val existing = QuickSessionLookup.findExisting(
            known = sessionProvider.knownSessions.value,
            displayName = label,
            persistedKey = preferences.getQuickSessionKey(),
        )
        if (existing != null) {
            preferences.saveQuickSessionKey(existing.sessionKey)
            check(sessionProvider.activeSession.value == activeBefore)
            return existing
        }

        if (!gatewayClient.isConnected()) return null
        val created = gatewayClient.createNamedSession(label, activate = false) ?: return null
        preferences.saveQuickSessionKey(created.sessionKey)
        check(sessionProvider.activeSession.value == activeBefore) {
            "ensure_quick_session_must_not_change_active"
        }
        return created
    }
}

/** Lógica pura de búsqueda (testeable sin Android). */
object QuickSessionLookup {
    fun findExisting(
        known: List<KnownSession>,
        displayName: String,
        persistedKey: String?,
    ): KnownSession? {
        val label = displayName.trim()
        val byKey = persistedKey?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { key -> known.find { it.sessionKey == key } }
        if (byKey != null) return byKey
        if (label.isEmpty()) return null
        return known.find { it.displayName == label }
    }
}
