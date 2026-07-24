package mx.ideass.personal.agent.app

import android.Manifest
import android.content.ComponentName
import android.content.Context
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
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.ideass.personal.agent.chat.ChatScreen
import mx.ideass.personal.agent.connection.ConnectionScreen
import mx.ideass.personal.agent.service.AgentService
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var boundService: AgentService? = null
    private var serviceBound = false

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
        setContent {
            AppTheme {
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .systemBarsPadding(),
                ) {
                    AppNav()
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val intent = Intent(this, AgentService::class.java)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
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
}

@HiltViewModel
class BootViewModel @Inject constructor(
    preferences: AppPreferences,
) : ViewModel() {
    val configured: StateFlow<Boolean?> = preferences.hubConfig
        .map { it != null }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
}

@Composable
private fun AppNav(
    bootViewModel: BootViewModel = hiltViewModel(),
) {
    val configured by bootViewModel.configured.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    var ready by remember { mutableStateOf(false) }

    LaunchedEffect(configured) {
        if (configured != null && !ready) {
            ready = true
            val start = if (configured == true) Routes.Chat else Routes.Connection
            navController.navigate(start) {
                popUpTo(Routes.Boot) { inclusive = true }
            }
        }
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
            ConnectionScreen(
                onConnected = {
                    if (!navController.popBackStack(Routes.Chat, inclusive = false)) {
                        navController.navigate(Routes.Chat) {
                            popUpTo(Routes.Connection) { inclusive = true }
                        }
                    }
                },
            )
        }
        composable(Routes.Chat) {
            ChatScreen(
                onOpenConnection = {
                    navController.navigate(Routes.Connection)
                },
            )
        }
    }
}
