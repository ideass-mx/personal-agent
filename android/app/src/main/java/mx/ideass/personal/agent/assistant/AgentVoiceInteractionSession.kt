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
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppTheme
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
        if (voiceStarted) return
        voiceStarted = true
        Log.d(TAG, "AgentVoiceSession: starting VoiceSession")
        voiceSession.start()
    }

    override fun onHide() {
        if (voiceStarted) {
            voiceStarted = false
            voiceSession.stop()
        }
        viewTreeOwner.moveTo(Lifecycle.State.CREATED)
        super.onHide()
    }

    override fun onDestroy() {
        if (voiceStarted) {
            voiceStarted = false
            voiceSession.stop()
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
