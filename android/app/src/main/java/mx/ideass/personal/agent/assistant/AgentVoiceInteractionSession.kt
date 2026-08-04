package mx.ideass.personal.agent.assistant

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppTheme
import mx.ideass.personal.agent.voice.HangReason
import mx.ideass.personal.agent.voice.VoiceOrigin
import mx.ideass.personal.agent.voice.VoiceScreenWakeController
import mx.ideass.personal.agent.voice.VoiceSession
import mx.ideass.personal.agent.voice.VoiceSessionContent
import mx.ideass.personal.agent.voice.VoiceVisSessionPolicy

/**
 * Ventana del asistente: invocador + UI opcional sobre el [VoiceSession]
 * singleton. Estilo Gemini mientras es visible (keep-screen-on, sobre keyguard
 * sin dismiss). Descartar esta ventana no cuelga la racha; el audio sigue en
 * el proceso + [mx.ideass.personal.agent.voice.VoiceMicForegroundService].
 *
 * HyperOS ignora keep-screen-on sobre el keyguard: el wake lock de pantalla
 * vive en [VoiceScreenWakeController] (racha ∧ ventana), no en syncs de turno.
 */
class AgentVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context) {

    private val entryPoint: VoiceSessionEntryPoint = EntryPointAccessors
        .fromApplication(context.applicationContext, VoiceSessionEntryPoint::class.java)

    private val voiceSession: VoiceSession = entryPoint.voiceSession()
    private val screenWake: VoiceScreenWakeController = entryPoint.voiceScreenWakeController()

    /**
     * Una VoiceInteractionSession no es una Activity, así que la vista raíz no
     * propaga los ViewTreeOwners que Compose necesita; los proveemos aquí.
     */
    private val viewTreeOwner = SessionViewTreeOwner()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var endCollectJob: Job? = null
    /** Esta instancia de ventana ya pidió start (no implica racha viva tras onHide). */
    private var voiceStarted = false
    private var windowVisible = false
    private var contentRoot: View? = null

    override fun onCreateContentView(): View {
        val rootView = FrameLayout(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setViewTreeLifecycleOwner(viewTreeOwner)
            setViewTreeViewModelStoreOwner(viewTreeOwner)
            setViewTreeSavedStateRegistryOwner(viewTreeOwner)
        }

        val composeView = ComposeView(context).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                val ui by voiceSession.ui.collectAsState()
                AppTheme {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(AppColors.background),
                    ) {
                        VoiceSessionContent(
                            ui = ui,
                            onEnd = {
                                // hangUp → earcon → sessionEnded → hide(); no hide() aquí.
                                voiceSession.hangUp(HangReason.Ui)
                            },
                        )
                    }
                }
            }
        }
        rootView.addView(
            composeView,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        contentRoot = rootView
        applyKeyguardWindowFlags()
        Log.d(TAG, "AgentVoiceSession: UI mounted")
        return rootView
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "onShow showFlags=$showFlags")
        windowVisible = true
        // Bit de ventana ANTES de start(): la racha activará el wake lock al
        // poner sessionActive (async). No re-sincronizar con isSessionActive aquí.
        screenWake.setWindowVisible(true)
        viewTreeOwner.moveTo(Lifecycle.State.RESUMED)
        applyKeyguardWindowFlags()

        when (
            VoiceVisSessionPolicy.onShow(
                uiBoundThisWindow = voiceStarted,
                voiceActive = voiceSession.isSessionActive,
            )
        ) {
            VoiceVisSessionPolicy.ShowAction.HangUpByReinvocation -> {
                // No hide() aquí: el earcon de cierre necesita SCO; sessionEnded → hide().
                // hangUp libera el bit de racha del wake lock; no tocamos turnos.
                ensureEndCollector()
                syncWindowKeepScreenOn(voiceActive = true)
                voiceSession.closeByReinvocation()
            }
            VoiceVisSessionPolicy.ShowAction.Start -> {
                voiceStarted = true
                ensureEndCollector()
                Log.d(TAG, "AgentVoiceSession: starting VoiceSession")
                voiceSession.start(VoiceOrigin.AssistantInvocation)
                // Flag de ventana: voiceStarted ya es true (start es async).
                syncWindowKeepScreenOn(voiceActive = true)
            }
        }
    }

    private fun ensureEndCollector() {
        if (endCollectJob?.isActive == true) return
        endCollectJob = scope.launch {
            voiceSession.sessionEnded.collect {
                // Keep-screen-on de ventana; el wake lock ya lo soltó VoiceSession.
                syncWindowKeepScreenOn(voiceActive = false)
                hide()
            }
        }
    }

    override fun onHide() {
        // Solo desmonta UI: la racha sigue en VoiceSession + FGS micrófono.
        // Wake lock de pantalla: solo el bit de ventana (audio puede seguir).
        endCollectJob?.cancel()
        endCollectJob = null
        voiceStarted = false
        windowVisible = false
        screenWake.setWindowVisible(false)
        syncWindowKeepScreenOn(voiceActive = false)
        // Deliberado: no voiceSession.stop() — ver VoiceVisSessionPolicy.
        viewTreeOwner.moveTo(Lifecycle.State.CREATED)
        super.onHide()
    }

    override fun onDestroy() {
        endCollectJob?.cancel()
        endCollectJob = null
        scope.cancel()
        voiceStarted = false
        windowVisible = false
        screenWake.setWindowVisible(false)
        screenWake.forceRelease()
        syncWindowKeepScreenOn(voiceActive = false)
        contentRoot = null
        // Deliberado: no voiceSession.stop() — ver VoiceVisSessionPolicy.
        viewTreeOwner.destroy()
        super.onDestroy()
    }

    /**
     * Sobre el keyguard, sin [WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD]:
     * el teléfono sigue bloqueado; la ventana convive con el lockscreen.
     */
    private fun applyKeyguardWindowFlags() {
        val win = runCatching { window.window }.getOrNull() ?: return
        if (VoiceVisSessionPolicy.shouldShowWhenLocked()) {
            @Suppress("DEPRECATION")
            win.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        }
        if (!VoiceVisSessionPolicy.shouldDismissKeyguard()) {
            @Suppress("DEPRECATION")
            win.clearFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }
    }

    /**
     * Solo flags de ventana (`FLAG_KEEP_SCREEN_ON` / `View.keepScreenOn`).
     * El wake lock `Agente:voz-pantalla` lo posee [VoiceScreenWakeController]
     * vía bits racha/ventana — no re-evaluar isSessionActive aquí (el start
     * async dejaba voiceActive=false y soltaba el lock a los ~ms).
     */
    private fun syncWindowKeepScreenOn(voiceActive: Boolean) {
        val keepOn = VoiceVisSessionPolicy.shouldKeepScreenOn(
            windowVisible = windowVisible,
            voiceActive = voiceActive,
        )
        contentRoot?.keepScreenOn = keepOn
        val win = runCatching { window.window }.getOrNull()
        if (win != null) {
            if (keepOn) {
                win.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                win.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        Log.d(
            TAG,
            "keepScreenOn=$keepOn windowVisible=$windowVisible voiceActive=$voiceActive " +
                "screenWake=${screenWake.isHeld}",
        )
    }

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    internal interface VoiceSessionEntryPoint {
        fun voiceSession(): VoiceSession
        fun voiceScreenWakeController(): VoiceScreenWakeController
    }

    private companion object {
        const val TAG = "AgentVoiceSession"
    }
}

/** Dueño de lifecycle/viewmodel/savedstate propio para la vista de la sesión. */
private class SessionViewTreeOwner : LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    private val savedStateRegistryController = SavedStateRegistryController.create(this)

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore = ViewModelStore()
    override val savedStateRegistry: SavedStateRegistry
        get() = savedStateRegistryController.savedStateRegistry

    init {
        savedStateRegistryController.performRestore(null)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
    }

    fun moveTo(state: Lifecycle.State) {
        if (lifecycleRegistry.currentState == Lifecycle.State.DESTROYED) return
        lifecycleRegistry.currentState = state
    }

    fun destroy() {
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        viewModelStore.clear()
    }
}
