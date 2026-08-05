package mx.ideass.personal.agent.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import mx.ideass.personal.agent.voice.VoiceLockscreenActivity
import mx.ideass.personal.agent.voice.VoiceOrigin
import mx.ideass.personal.agent.voice.VoiceSession
import mx.ideass.personal.agent.voice.VoiceVisSessionPolicy

/**
 * Invocador del asistente: arranca / cuelga la racha y lanza
 * [VoiceLockscreenActivity] como superficie visible (patrón Gemini /
 * `FloatyActivity`). La UI ya no vive en la ventana del VIS — evita dos
 * superficies y permite que HyperOS retire `gxzw_*` cuando la Activity
 * queda como `topResumedActivity` sobre el keyguard.
 *
 * Descartar esta sesión no cuelga la racha; el audio sigue en el proceso +
 * [mx.ideass.personal.agent.voice.VoiceMicForegroundService].
 */
class AgentVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context) {

    private val entryPoint: VoiceSessionEntryPoint = EntryPointAccessors
        .fromApplication(context.applicationContext, VoiceSessionEntryPoint::class.java)

    private val voiceSession: VoiceSession = entryPoint.voiceSession()

    /** Esta instancia ya pidió start (no implica racha viva tras hide). */
    private var voiceStarted = false
    private var shownAtElapsed = 0L

    override fun onCreateContentView(): View {
        // Stub vacío: la UI está en VoiceLockscreenActivity.
        return FrameLayout(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "onShow showFlags=$showFlags")
        shownAtElapsed = android.os.SystemClock.elapsedRealtime()

        when (
            VoiceVisSessionPolicy.onShow(
                uiBoundThisWindow = voiceStarted,
                voiceActive = voiceSession.isSessionActive,
            )
        ) {
            VoiceVisSessionPolicy.ShowAction.HangUpByReinvocation -> {
                Log.d(TAG, "reinvocación → hangUp")
                voiceSession.closeByReinvocation()
                // La Activity se cierra sola al pasar sessionActive→false; ocultar VIS.
                hide()
            }
            VoiceVisSessionPolicy.ShowAction.Start -> {
                voiceStarted = true
                Log.d(TAG, "arrancando VoiceSession + VoiceLockscreenActivity")
                voiceSession.start(VoiceOrigin.AssistantInvocation)
                launchLockscreenSurface()
                // Retirar la ventana VIS para no competir con la Activity.
                // post: deja que startAssistantActivity encole antes del hide.
                window?.window?.decorView?.post { hide() }
                    ?: hide()
            }
        }
    }

    override fun onHide() {
        val ageMs = android.os.SystemClock.elapsedRealtime() - shownAtElapsed
        if (VoiceVisSessionPolicy.shouldIgnoreSpuriousHide(
                ageMsSinceShow = ageMs,
                voiceActive = voiceSession.isSessionActive,
            )
        ) {
            Log.w(TAG, "onHide ignorado (posible espurio ageMs=$ageMs voz activa)")
            super.onHide()
            return
        }
        voiceStarted = false
        // Deliberado: no voiceSession.stop() — ver VoiceVisSessionPolicy.
        super.onHide()
    }

    override fun onDestroy() {
        voiceStarted = false
        // Deliberado: no voiceSession.stop(); wake de pantalla lo posee la Activity.
        super.onDestroy()
    }

    /**
     * Lanza la Activity oclusora vía [startAssistantActivity] (participa en
     * KeyguardController como Gemini). Fallback a startActivity si falla.
     */
    private fun launchLockscreenSurface() {
        val intent = VoiceLockscreenActivity.createIntent(context).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val launched = runCatching {
            startAssistantActivity(intent)
            true
        }.getOrElse { err ->
            Log.w(TAG, "startAssistantActivity falló: ${err.message}")
            false
        }
        if (!launched) {
            runCatching {
                context.startActivity(intent)
            }.onFailure { err ->
                Log.e(TAG, "fallback startActivity falló: ${err.message}")
            }
        }
    }

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    internal interface VoiceSessionEntryPoint {
        fun voiceSession(): VoiceSession
    }

    private companion object {
        const val TAG = "AgentVoiceSession"
    }
}
