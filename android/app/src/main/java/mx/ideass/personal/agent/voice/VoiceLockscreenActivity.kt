package mx.ideass.personal.agent.voice

import android.graphics.PixelFormat
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppTheme

/**
 * Superficie visible de la racha sobre el keyguard (patrón Gemini /
 * `FloatyActivity`): Activity `showWhenLocked` resumida, no la ventana del VIS.
 *
 * El audio/ciclo vive en [VoiceSession]; esta Activity solo monta la UI,
 * gobierna keep-screen-on / wake de pantalla (bit «ventana») y cierra con
 * Terminar, comando de voz o [VoiceSession.sessionEnded] — mismo
 * [closeSurface] (nunca Idle «En pausa» pegado).
 *
 * [VoiceOrigin.InConversation] no usa esta Activity.
 */
@AndroidEntryPoint
class VoiceLockscreenActivity : ComponentActivity() {

    @Inject lateinit var voiceSession: VoiceSession
    @Inject lateinit var screenWake: VoiceScreenWakeController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        applyOccludingWindow()
        Log.d(TAG, "onCreate")

        setContent {
            val ui by voiceSession.ui.collectAsStateWithLifecycle()
            AppTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(AppColors.background),
                ) {
                    VoiceSessionContent(
                        ui = ui,
                        onEnd = {
                            voiceSession.hangUp(HangReason.Ui)
                            closeSurface()
                        },
                    )
                }
            }
        }

        // VIS puede haber arrancado la racha ya; si venimos de fallback, arrancar aquí.
        if (!voiceSession.isSessionActive) {
            Log.d(TAG, "arrancando VoiceSession (fallback / sin VIS previo)")
            voiceSession.start(VoiceOrigin.AssistantInvocation)
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Comando de voz / silencio / reinvocación: misma finish que Terminar.
                // No usar solo sessionEnded (buffer podía perder el evento → Idle «En pausa»).
                var sawActive = false
                voiceSession.sessionActiveFlow.collect { active ->
                    if (active) {
                        sawActive = true
                        syncKeepScreenOn(voiceActive = true)
                    } else if (
                        VoiceHangClosePolicy.shouldFinishSurface(
                            sawSessionActive = sawActive,
                            sessionActive = false,
                        )
                    ) {
                        Log.d(TAG, "sessionActiveFlow → closeSurface")
                        closeSurface()
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        screenWake.setWindowVisible(true)
        syncKeepScreenOn(voiceActive = voiceSession.isSessionActive)
        Log.d(TAG, "onStart screenWake=${screenWake.isHeld}")
    }

    override fun onResume() {
        super.onResume()
        // Reaplicar por si el sistema limpia flags al pasar por keyguard.
        applyOccludingWindow()
        syncKeepScreenOn(voiceActive = voiceSession.isSessionActive)
    }

    override fun onStop() {
        // Equivalente a onHide del VIS: suelta bit de superficie; la racha puede seguir.
        screenWake.setWindowVisible(false)
        syncKeepScreenOn(voiceActive = false)
        Log.d(TAG, "onStop screenWake=${screenWake.isHeld}")
        super.onStop()
    }

    override fun onDestroy() {
        screenWake.setWindowVisible(false)
        if (isFinishing) {
            screenWake.forceRelease()
        }
        Log.d(TAG, "onDestroy finishing=$isFinishing")
        super.onDestroy()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Segunda invocación: el VIS ya colgó o colgará; si aún hay racha, colgar aquí.
        if (voiceSession.isSessionActive) {
            Log.d(TAG, "onNewIntent con racha activa → hangUp reinvocation")
            voiceSession.closeByReinvocation()
        }
    }

    /**
     * Cierra la superficie liberando holds de pantalla (wake + keep-screen-on +
     * turnScreenOn) para que el keyguard pueda apagar por timeout — sin dejar
     * `Agente:voz-pantalla` residual. No toca el bloqueo (sigue pidiendo huella).
     */
    private fun closeSurface() {
        if (isFinishing) return
        if (VoiceHangClosePolicy.releaseScreenHoldsBeforeFinish()) {
            releaseScreenHolds()
        }
        Log.d(TAG, "closeSurface screenWake=${screenWake.isHeld}")
        finish()
    }

    private fun releaseScreenHolds() {
        screenWake.forceRelease()
        window.decorView.keepScreenOn = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.clearFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setTurnScreenOn(false)
        }
    }

    /**
     * Pantalla completa opaca (cubre región UDFPS). Flags alineados a lo
     * observable de Gemini `FloatyActivity`: showWhenLocked + turnScreenOn
     * en manifiesto/runtime; sin dismiss del keyguard.
     */
    private fun applyOccludingWindow() {
        if (!VoiceVisSessionPolicy.shouldShowWhenLocked()) return
        val win = window
        val bg = ContextCompat.getColor(this, R.color.voice_session_background)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        win.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        if (!VoiceVisSessionPolicy.shouldDismissKeyguard()) {
            @Suppress("DEPRECATION")
            win.clearFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }
        if (!VoiceVisSessionPolicy.shouldOccludeKeyguardVisually()) return
        if (VoiceVisSessionPolicy.sessionWindowIsTranslucent()) return

        win.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        win.setFormat(PixelFormat.OPAQUE)
        win.setBackgroundDrawable(ColorDrawable(bg))
        @Suppress("DEPRECATION")
        win.statusBarColor = bg
        @Suppress("DEPRECATION")
        win.navigationBarColor = bg
        @Suppress("DEPRECATION")
        win.clearFlags(
            WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS or
                WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION,
        )
        win.addFlags(
            WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_DIM_BEHIND,
        )
        val attrs = win.attributes
        attrs.width = ViewGroup.LayoutParams.MATCH_PARENT
        attrs.height = ViewGroup.LayoutParams.MATCH_PARENT
        attrs.format = PixelFormat.OPAQUE
        attrs.dimAmount = 1f
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            attrs.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        win.attributes = attrs
        win.decorView.setBackgroundColor(bg)
        win.decorView.alpha = 1f
    }

    private fun syncKeepScreenOn(voiceActive: Boolean) {
        val keepOn = VoiceVisSessionPolicy.shouldKeepScreenOn(
            windowVisible = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED),
            voiceActive = voiceActive,
        )
        window.decorView.keepScreenOn = keepOn
        if (keepOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    companion object {
        private const val TAG = "VoiceLockscreen"

        /** Intent explícito para [android.service.voice.VoiceInteractionSession.startAssistantActivity]. */
        fun createIntent(context: android.content.Context): android.content.Intent =
            android.content.Intent(context, VoiceLockscreenActivity::class.java)
    }
}
