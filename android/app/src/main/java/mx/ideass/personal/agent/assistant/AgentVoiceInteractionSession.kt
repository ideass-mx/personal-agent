package mx.ideass.personal.agent.assistant

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.drawable.ColorDrawable
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
import androidx.core.content.ContextCompat
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
import mx.ideass.personal.agent.R
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
 * sin dismiss, oclusión visual opaca). Descartar esta ventana no cuelga la
 * racha; el audio sigue en el proceso + [mx.ideass.personal.agent.voice.VoiceMicForegroundService].
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
    /** elapsedRealtime del último onShow (filtro de onHide espurio). */
    private var shownAtElapsed = 0L

    init {
        // Antes de onCreate: evita el tema translúcido por defecto del VIS.
        setTheme(R.style.Theme_Agente_VoiceSession)
    }

    override fun onCreateContentView(): View {
        val sessionBg = ContextCompat.getColor(context, R.color.voice_session_background)
        val rootView = FrameLayout(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(sessionBg)
            isClickable = true
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
                                // Idempotente: cierra ventana aunque la sesión ya murió.
                                voiceSession.hangUp(HangReason.Ui)
                                hide()
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
        applyOccludingSessionWindow()
        Log.d(TAG, "AgentVoiceSession: UI mounted")
        return rootView
    }

    /**
     * Pantalla completa: sin insets de “panel” (el default pone top=altura y
     * deja ver/activo el keyguard debajo).
     */
    override fun onComputeInsets(outInsets: Insets) {
        if (VoiceVisSessionPolicy.shouldOccludeKeyguardVisually()) {
            outInsets.contentInsets.set(0, 0, 0, 0)
            outInsets.touchableInsets = Insets.TOUCHABLE_INSETS_FRAME
            outInsets.touchableRegion.setEmpty()
        } else {
            super.onComputeInsets(outInsets)
        }
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "onShow showFlags=$showFlags")
        shownAtElapsed = android.os.SystemClock.elapsedRealtime()
        windowVisible = true
        // Bit de ventana ANTES de start(): la racha activará el wake lock al
        // poner sessionActive (async). No re-sincronizar con isSessionActive aquí.
        screenWake.setWindowVisible(true)
        viewTreeOwner.moveTo(Lifecycle.State.RESUMED)
        applyOccludingSessionWindow()

        when (
            VoiceVisSessionPolicy.onShow(
                uiBoundThisWindow = voiceStarted,
                voiceActive = voiceSession.isSessionActive,
            )
        ) {
            VoiceVisSessionPolicy.ShowAction.HangUpByReinvocation -> {
                // No hide() aquí: sessionEnded inmediato → hide().
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
        val ageMs = android.os.SystemClock.elapsedRealtime() - shownAtElapsed
        // HyperOS a veces dispara onHide ~ms tras onShow sin retirar la ventana.
        // Si la voz sigue activa en la gracia, no tocamos bits ni cancelamos el
        // colector de sessionEnded (evita cascarón + Terminar muerto).
        if (VoiceVisSessionPolicy.shouldIgnoreSpuriousHide(
                ageMsSinceShow = ageMs,
                voiceActive = voiceSession.isSessionActive,
            )
        ) {
            Log.w(TAG, "onHide ignorado (posible espurio ageMs=$ageMs voz activa)")
            super.onHide()
            return
        }
        // No cancelar endCollectJob: sessionEnded debe poder hide() tras anuncio
        // o si el sistema re-muestra contenido sin nuevo onShow.
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
     * el teléfono sigue bloqueado. Ventana MATCH_PARENT opaca para ocluir
     * visualmente el lockscreen (incl. afordancia UDFPS cuando el sistema lo
     * respete).
     */
    private fun applyOccludingSessionWindow() {
        val win = runCatching { window.window }.getOrNull() ?: return
        val bg = ContextCompat.getColor(context, R.color.voice_session_background)

        if (VoiceVisSessionPolicy.shouldShowWhenLocked()) {
            @Suppress("DEPRECATION")
            win.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        }
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
        win.attributes = attrs
        // Evitar alpha/translucidez residual del decor.
        win.decorView.setBackgroundColor(bg)
        win.decorView.alpha = 1f
        Log.d(TAG, "AgentVoiceSession: ventana oclusora opaca aplicada bg=#${Integer.toHexString(bg)}")
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
