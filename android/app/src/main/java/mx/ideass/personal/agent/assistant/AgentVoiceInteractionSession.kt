package mx.ideass.personal.agent.assistant

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log
import android.view.View
import android.view.ViewGroup
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
import mx.ideass.personal.agent.voice.VoiceOrigin
import mx.ideass.personal.agent.voice.VoiceSession
import mx.ideass.personal.agent.voice.VoiceSessionContent

/**
 * Sesión de VoiceInteraction: monta la UI de voz existente y arranca el mismo
 * [VoiceSession] singleton que usa la app.
 */
class AgentVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context) {

    private val voiceSession: VoiceSession = EntryPointAccessors
        .fromApplication(context.applicationContext, VoiceSessionEntryPoint::class.java)
        .voiceSession()

    /**
     * Una VoiceInteractionSession no es una Activity, así que la vista raíz no
     * propaga los ViewTreeOwners que Compose necesita; los proveemos aquí.
     */
    private val viewTreeOwner = SessionViewTreeOwner()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var endCollectJob: Job? = null
    private var voiceStarted = false

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
                            onEnd = { hide() },
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
        Log.d(TAG, "AgentVoiceSession: UI mounted")
        return rootView
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "onShow showFlags=$showFlags")
        viewTreeOwner.moveTo(Lifecycle.State.RESUMED)

        // Toggle: segunda invocación (power / triple-toque) cierra en vez de reabrir.
        // No hide() aquí: el earcon de cierre necesita SCO; sessionEnded → hide().
        if (voiceStarted || voiceSession.isSessionActive) {
            ensureEndCollector()
            voiceSession.closeByReinvocation()
            return
        }

        voiceStarted = true
        ensureEndCollector()
        Log.d(TAG, "AgentVoiceSession: starting VoiceSession")
        voiceSession.start(VoiceOrigin.AssistantInvocation)
    }

    private fun ensureEndCollector() {
        if (endCollectJob?.isActive == true) return
        endCollectJob = scope.launch {
            voiceSession.sessionEnded.collect {
                hide()
            }
        }
    }

    override fun onHide() {
        endCollectJob?.cancel()
        endCollectJob = null
        if (voiceStarted || voiceSession.isSessionActive) {
            voiceStarted = false
            // Si el cierre con earcon aún no terminó, stop() cancela el pending y limpia ya.
            voiceSession.stop()
        } else {
            voiceStarted = false
        }
        viewTreeOwner.moveTo(Lifecycle.State.CREATED)
        super.onHide()
    }

    override fun onDestroy() {
        endCollectJob?.cancel()
        endCollectJob = null
        scope.cancel()
        if (voiceStarted || voiceSession.isSessionActive) {
            voiceStarted = false
            voiceSession.stop()
        } else {
            voiceStarted = false
        }
        viewTreeOwner.destroy()
        super.onDestroy()
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
