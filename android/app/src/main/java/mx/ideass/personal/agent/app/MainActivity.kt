package mx.ideass.personal.agent.app

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import mx.ideass.personal.agent.chat.ChatScreen
import mx.ideass.personal.agent.chat.SessionsScreen
import mx.ideass.personal.agent.connection.ConnectionScreen
import mx.ideass.personal.agent.service.AgentService
import mx.ideass.personal.agent.settings.SettingsScreen
import mx.ideass.personal.agent.voice.VoiceLaunch
import mx.ideass.personal.agent.voice.VoiceOrigin
import mx.ideass.personal.agent.voice.VoiceScreen
import mx.ideass.personal.agent.voice.VoiceSettingsScreen
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var boundService: AgentService? = null
    private var serviceBound = false
    private val pendingVoiceLaunch = MutableStateFlow(false)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            boundService = (binder as AgentService.LocalBinder).getService()
            serviceBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            boundService = null
            serviceBound = false
        }
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* la notificación del FGS sigue aunque el usuario niegue el permiso de alertas */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false
        requestNotificationPermissionIfNeeded()
        AgentService.start(this)
        consumeHablarIntent(intent)
        setContent {
            AppTheme {
                val launchVoice by pendingVoiceLaunch.collectAsStateWithLifecycle()
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .systemBarsPadding(),
                ) {
                    AppNav(
                        launchVoice = launchVoice,
                        onVoiceLaunched = { pendingVoiceLaunch.value = false },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeHablarIntent(intent)
    }

    private fun consumeHablarIntent(intent: Intent?) {
        if (intent?.action != AgentService.ACTION_HABLAR) return
        // Misma ruta que notificación/tile: VIS o VoiceLockscreenActivity.
        // No setShowWhenLocked aquí — la superficie de racha ya lo declara.
        VoiceLaunch.fromFallback(this)
    }

    override fun onStart() {
        super.onStart()
        // Sin BIND_AUTO_CREATE: el FGS ya se pidió en onCreate; el bind solo
        // observa estado y no crea/promueve el service por su cuenta.
        val intent = Intent(this, AgentService::class.java)
        bindService(intent, serviceConnection, 0)
    }

    override fun onStop() {
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
            boundService = null
        }
        super.onStop()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

private object Routes {
    const val Boot = "boot"
    const val Connection = "connection"
    const val Chat = "chat"
    const val Sessions = "sessions"
    const val Settings = "settings"
    const val VoiceSettings = "settings/voice"
    /** Invocación del asistente (racha nueva). */
    const val VoiceAssistant = "voice"
    /** Micrófono desde conversación abierta (`sessionKey` URL-encoded). */
    const val VoiceInConversation = "voice/in/{sessionKey}"

    fun voiceInConversation(sessionKey: String): String {
        val encoded = URLEncoder.encode(sessionKey, StandardCharsets.UTF_8.toString())
        return "voice/in/$encoded"
    }
}

@HiltViewModel
class BootViewModel @Inject constructor(
    preferences: AppPreferences,
) : ViewModel() {
    val configured: StateFlow<Boolean?> = preferences.configured
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
}

@Composable
private fun AppNav(
    launchVoice: Boolean = false,
    onVoiceLaunched: () -> Unit = {},
    bootViewModel: BootViewModel = hiltViewModel(),
) {
    val configured by bootViewModel.configured.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    var ready by remember { mutableStateOf(false) }

    // Arranque siempre al chat (vacío / sin configurar). El Gateway es opcional:
    // Ajustes → Conexión lo gestiona cuando el usuario quiera; Voz es local.
    LaunchedEffect(configured) {
        if (configured != null && !ready) {
            ready = true
            navController.navigate(Routes.Chat) {
                popUpTo(Routes.Boot) { inclusive = true }
            }
        }
    }

    LaunchedEffect(launchVoice, ready, configured) {
        if (!launchVoice || !ready || configured != true) return@LaunchedEffect
        navController.navigate(Routes.VoiceAssistant) {
            launchSingleTop = true
        }
        onVoiceLaunched()
    }

    NavHost(
        navController = navController,
        startDestination = Routes.Boot,
        modifier = Modifier.fillMaxSize(),
    ) {
        composable(Routes.Boot) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.fillMaxSize(),
            )
        }
        composable(Routes.Connection) {
            val canGoBack = navController.previousBackStackEntry != null
            ConnectionScreen(
                onConnected = {
                    if (!navController.popBackStack(Routes.Chat, inclusive = false)) {
                        navController.navigate(Routes.Chat) {
                            popUpTo(Routes.Connection) { inclusive = true }
                        }
                    }
                },
                onBack = if (canGoBack) {
                    { navController.popBackStack() }
                } else {
                    null
                },
            )
        }
        composable(Routes.Chat) {
            ChatScreen(
                onOpenSettings = {
                    navController.navigate(Routes.Settings)
                },
                onOpenVoice = { sessionKey ->
                    navController.navigate(Routes.voiceInConversation(sessionKey))
                },
                onOpenSessions = {
                    navController.navigate(Routes.Sessions)
                },
            )
        }
        composable(Routes.Sessions) {
            SessionsScreen(
                onBack = { navController.popBackStack() },
                onSessionSelected = { navController.popBackStack() },
            )
        }
        composable(Routes.Settings) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onOpenConnection = { navController.navigate(Routes.Connection) },
                onOpenVoice = { navController.navigate(Routes.VoiceSettings) },
            )
        }
        composable(Routes.VoiceSettings) {
            VoiceSettingsScreen(
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.VoiceAssistant,
            enterTransition = {
                fadeIn() + slideInVertically { it / 12 }
            },
            exitTransition = {
                fadeOut() + slideOutVertically { it / 12 }
            },
            popEnterTransition = { fadeIn() },
            popExitTransition = {
                fadeOut() + slideOutVertically { it / 10 }
            },
        ) {
            VoiceScreen(
                origin = VoiceOrigin.AssistantInvocation,
                onFinished = {
                    navController.popBackStack()
                },
            )
        }
        composable(
            route = Routes.VoiceInConversation,
            arguments = listOf(
                navArgument("sessionKey") { type = NavType.StringType },
            ),
            enterTransition = {
                fadeIn() + slideInVertically { it / 12 }
            },
            exitTransition = {
                fadeOut() + slideOutVertically { it / 12 }
            },
            popEnterTransition = { fadeIn() },
            popExitTransition = {
                fadeOut() + slideOutVertically { it / 10 }
            },
        ) { entry ->
            val raw = entry.arguments?.getString("sessionKey").orEmpty()
            val key = URLDecoder.decode(raw, StandardCharsets.UTF_8.toString())
            VoiceScreen(
                origin = VoiceOrigin.InConversation(key),
                onFinished = {
                    navController.popBackStack()
                },
            )
        }
    }
}
