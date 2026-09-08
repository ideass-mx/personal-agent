package mx.ideass.personal.agent.connection

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import androidx.compose.ui.res.stringResource
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii
import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.service.ConnectionHealth
import mx.ideass.personal.agent.settings.SettingsHeader
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.TimeUnit

@Composable
fun ConnectionScreen(
    onConnected: () -> Unit,
    onBack: (() -> Unit)? = null,
    viewModel: ConnectionViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val health by viewModel.health.collectAsStateWithLifecycle()
    var showScanner by remember { mutableStateOf(false) }
    var showManualUri by remember { mutableStateOf(false) }
    var qrUri by remember { mutableStateOf("") }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = AppColors.textPrimary,
        unfocusedTextColor = AppColors.textPrimary,
        focusedBorderColor = AppColors.accent,
        unfocusedBorderColor = AppColors.border,
        focusedContainerColor = AppColors.surface,
        unfocusedContainerColor = AppColors.surface,
        cursorColor = AppColors.accent,
        focusedLabelColor = AppColors.textMuted,
        unfocusedLabelColor = AppColors.textMuted,
    )

    if (showScanner && ui.backend == ConnectionBackend.HUB) {
        PairingQrScanScreen(
            onValidUri = { uri ->
                showScanner = false
                viewModel.pairWithQrUri(uri, onConnected)
            },
            onEnterManually = {
                showScanner = false
                showManualUri = true
            },
            onBack = { showScanner = false },
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        if (onBack != null) {
            SettingsHeader(
                title = stringResource(R.string.settings_section_connection),
                subtitle = stringResource(R.string.settings_section_connection_subtitle),
                onBack = onBack,
            )
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(
                    horizontal = 24.dp,
                    vertical = if (onBack != null) 16.dp else 32.dp,
                ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = if (ui.backend == ConnectionBackend.GATEWAY) {
                    "Gateway legacy"
                } else {
                    "Conecta tu agente"
                },
                color = AppColors.textPrimary,
                fontSize = 28.sp,
            )
            Text(
                text = if (ui.backend == ConnectionBackend.GATEWAY) {
                    "Conexión avanzada a un Gateway legacy. El camino recomendado es el agente en tu PC (Hub)."
                } else {
                    "Tu agente vive en tu PC. Usa tu teléfono para hablar con él y autorizar acciones."
                },
                color = AppColors.textMuted,
                fontSize = 15.sp,
            )

            Spacer(modifier = Modifier.height(8.dp))

            if (ui.backend == ConnectionBackend.HUB) {
                Button(
                    onClick = { showScanner = true },
                    enabled = !ui.testing,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = AppColors.accent),
                ) {
                    Text(
                        if (ui.pairingPending) {
                            "Esperando aprobación en el PC…"
                        } else {
                            "Escanear código QR"
                        },
                    )
                }
                Text(
                    text = "Abre Personal Agent en el PC y escanea el código QR de emparejamiento.",
                    color = AppColors.textMuted,
                    fontSize = 13.sp,
                )
                OutlinedButton(
                    onClick = { showManualUri = !showManualUri },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.textMuted),
                ) {
                    Text(
                        if (showManualUri) {
                            "Ocultar entrada manual"
                        } else {
                            "Introducir código manualmente"
                        },
                    )
                }
                if (showManualUri) {
                    OutlinedTextField(
                        value = qrUri,
                        onValueChange = { qrUri = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("URI del QR (personalagent://pair?…)") },
                        colors = fieldColors,
                        singleLine = true,
                    )
                    Button(
                        onClick = { viewModel.pairWithQrUri(qrUri, onConnected) },
                        enabled = !ui.testing && qrUri.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = AppColors.accent),
                    ) {
                        Text(if (ui.pairingPending) "Esperando PC…" else "Emparejar con URI")
                    }
                }
            }

            if (ui.backend == ConnectionBackend.HUB) {
                OutlinedButton(
                    onClick = viewModel::toggleAdvanced,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.textMuted),
                ) {
                    Text(if (ui.showAdvanced) "Ocultar avanzado" else "Avanzado / Legacy")
                }
                if (ui.showAdvanced) {
                    Text(
                        text = "Este es un backend legacy. Solo úsalo si ya tienes un Gateway legacy.",
                        color = AppColors.textMuted,
                        fontSize = 13.sp,
                    )
                    OutlinedButton(
                        onClick = viewModel::useLegacyGateway,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.warn),
                    ) {
                        Text("Usar Gateway legacy")
                    }
                }
            } else {
                OutlinedButton(
                    onClick = viewModel::useHubBackend,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.accent),
                ) {
                    Text("Volver al agente en la PC (Hub)")
                }
            }

            OutlinedTextField(
                value = ui.address,
                onValueChange = viewModel::onAddressChange,
                modifier = Modifier.fillMaxWidth(),
                label = {
                    Text(
                        if (ui.backend == ConnectionBackend.GATEWAY) {
                            "URL del Gateway"
                        } else {
                            "Dirección del Hub"
                        },
                    )
                },
                placeholder = {
                    Text(
                        if (ui.backend == ConnectionBackend.GATEWAY) {
                            "wss://host:18789"
                        } else {
                            "ws://10.0.2.2:8787"
                        },
                    )
                },
                singleLine = true,
                shape = RoundedCornerShape(AppRadii.card),
                colors = fieldColors,
                textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace),
            )

            OutlinedTextField(
                value = ui.token,
                onValueChange = viewModel::onTokenChange,
                modifier = Modifier.fillMaxWidth(),
                label = {
                    Text(
                        if (ui.backend == ConnectionBackend.GATEWAY) {
                            "Token"
                        } else {
                            "Token (HUB_TOKEN)"
                        },
                    )
                },
                singleLine = true,
                shape = RoundedCornerShape(AppRadii.card),
                colors = fieldColors,
                visualTransformation = if (ui.tokenVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                trailingIcon = {
                    IconButton(onClick = viewModel::toggleTokenVisible) {
                        Icon(
                            imageVector = if (ui.tokenVisible) {
                                Icons.Default.VisibilityOff
                            } else {
                                Icons.Default.Visibility
                            },
                            contentDescription = if (ui.tokenVisible) "Ocultar token" else "Mostrar token",
                            tint = AppColors.textMuted,
                        )
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )

            if (ui.backend == ConnectionBackend.GATEWAY) {
                OutlinedTextField(
                    value = ui.bootstrapToken,
                    onValueChange = viewModel::onBootstrapChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Setup-code (opcional)") },
                    singleLine = true,
                    shape = RoundedCornerShape(AppRadii.card),
                    colors = fieldColors,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
                OutlinedTextField(
                    value = ui.agentId,
                    onValueChange = viewModel::onAgentIdChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("agentId (opcional)") },
                    singleLine = true,
                    shape = RoundedCornerShape(AppRadii.card),
                    colors = fieldColors,
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace),
                )
                OutlinedTextField(
                    value = ui.sessionKey,
                    onValueChange = viewModel::onSessionKeyChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("sessionKey (opcional)") },
                    singleLine = true,
                    shape = RoundedCornerShape(AppRadii.card),
                    colors = fieldColors,
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace),
                )
            }

            if (ui.backend == ConnectionBackend.HUB) {
                Text(
                    text = "En tu PC, define la carpeta de trabajo con AGENT_FILESYSTEM_ROOT " +
                        "(en hub/.env). Es la carpeta que el agente puede leer y modificar " +
                        "cuando una herramienta lo requiera.",
                    color = AppColors.textMuted,
                    fontSize = 13.sp,
                )
            }

            OutlinedTextField(
                value = ui.deviceName,
                onValueChange = viewModel::onDeviceNameChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nombre del dispositivo") },
                singleLine = true,
                shape = RoundedCornerShape(AppRadii.card),
                colors = fieldColors,
            )

            Button(
                onClick = { viewModel.testAndConnect(onConnected) },
                enabled = !ui.testing,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(AppRadii.cta),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AppColors.accent,
                    contentColor = AppColors.onAccent,
                    disabledContainerColor = AppColors.accent.copy(alpha = 0.5f),
                    disabledContentColor = AppColors.onAccent,
                ),
            ) {
                if (ui.testing) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(22.dp),
                        color = AppColors.onAccent,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Probar y conectar", fontSize = 16.sp)
                }
            }

            if (ui.testing) {
                OutlinedButton(
                    onClick = viewModel::cancelConnect,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(AppRadii.cta),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.textMuted),
                ) {
                    Text(if (ui.pairingPending) "Cancelar emparejamiento" else "Cancelar")
                }
            }

            ui.resultMessage?.let { message ->
                Text(
                    text = message,
                    color = if (ui.resultOk) AppColors.accent else AppColors.warn,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
                        .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
                        .padding(14.dp),
                )
            }

            if (ui.hasSavedConfig) {
                Spacer(modifier = Modifier.height(8.dp))
                ConnectionHealthSection(health = health)
            }

            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Los datos se guardan solo en este teléfono.",
                color = AppColors.textMuted,
                fontSize = 12.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

@Composable
private fun ConnectionHealthSection(health: ConnectionHealth) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var batteryExempt by remember {
        mutableStateOf(isIgnoringBatteryOptimizations(context))
    }
    var nowTick by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(health.connectedSinceMs) {
        while (health.connectedSinceMs != null) {
            nowTick = System.currentTimeMillis()
            delay(1_000)
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                batteryExempt = isIgnoringBatteryOptimizations(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Salud de la conexión",
            color = AppColors.textPrimary,
            fontSize = 18.sp,
        )
        Text(
            text = "HyperOS y el ahorro de batería pueden matar la conexión en segundo plano. " +
                "Estas excepciones mantienen al agente vivo con la pantalla bloqueada.",
            color = AppColors.textMuted,
            fontSize = 13.sp,
        )

        HealthRow(label = "Estado", value = healthStateLabel(health.state), accent = health.state is ConnectionState.Conectado)
        HealthRow(
            label = "Tiempo conectado",
            value = formatConnectedDuration(health.connectedSinceMs, nowTick),
        )
        HealthRow(label = "Último mensaje", value = formatLastMessage(health.lastMessageReceivedMs))

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = "Exención de batería: ${if (batteryExempt) "concedida" else "no concedida"}",
            color = if (batteryExempt) AppColors.accent else AppColors.warn,
            fontSize = 13.sp,
        )
        OutlinedButton(
            onClick = {
                if (batteryExempt) {
                    Toast.makeText(context, "Ya está concedida", Toast.LENGTH_SHORT).show()
                } else {
                    requestBatteryExemption(context)
                }
            },
            enabled = !batteryExempt,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(AppRadii.cta),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = AppColors.accent,
                disabledContentColor = AppColors.textMuted,
            ),
        ) {
            Text(
                if (batteryExempt) "Optimización de batería ignorada"
                else "Ignorar optimización de batería",
            )
        }
        Text(
            text = "Sin esta exención, Android puede congelar el service tras unos minutos con la pantalla apagada.",
            color = AppColors.textMuted,
            fontSize = 12.sp,
        )

        OutlinedButton(
            onClick = { openXiaomiAutostart(context) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(AppRadii.cta),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.accent),
        ) {
            Text("Abrir autostart (Xiaomi / HyperOS)")
        }
        Text(
            text = "En HyperOS el autostart controla si el agente revive tras un reinicio o un cierre forzado. Actívalo para esta app.",
            color = AppColors.textMuted,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun HealthRow(label: String, value: String, accent: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = AppColors.textMuted, fontSize = 13.sp)
        Text(
            text = value,
            color = if (accent) AppColors.accent else AppColors.textPrimary,
            fontSize = 13.sp,
        )
    }
}

private fun healthStateLabel(state: ConnectionState): String = when (state) {
    is ConnectionState.Conectado -> "Conectado"
    is ConnectionState.Reconectando -> {
        if (state.segundos > 0) "Reconectando · ${state.segundos}s" else "Reconectando…"
    }
    is ConnectionState.Emparejando -> "Emparejando"
    is ConnectionState.Error -> state.message
    is ConnectionState.SinConfigurar -> "Sin configurar"
}

private fun formatConnectedDuration(sinceMs: Long?, nowMs: Long): String {
    if (sinceMs == null) return "—"
    val elapsed = (nowMs - sinceMs).coerceAtLeast(0L)
    val hours = TimeUnit.MILLISECONDS.toHours(elapsed)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(elapsed) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(elapsed) % 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m ${seconds}s"
        else -> "${seconds}s"
    }
}

private fun formatLastMessage(atMs: Long?): String {
    if (atMs == null) return "Ninguno aún"
    return DateFormat.getTimeInstance(DateFormat.MEDIUM).format(Date(atMs))
}

private fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val pm = context.getSystemService(PowerManager::class.java) ?: return false
    return pm.isIgnoringBatteryOptimizations(context.packageName)
}

private fun requestBatteryExemption(context: Context) {
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
    }
    runCatching { context.startActivity(intent) }
        .onFailure {
            Toast.makeText(context, "No se pudo abrir el diálogo de batería", Toast.LENGTH_SHORT).show()
        }
}

private fun openXiaomiAutostart(context: Context) {
    val xiaomi = Intent().setComponent(
        ComponentName(
            "com.miui.securitycenter",
            "com.miui.securitycenter.permissions.activity.AutoStartManagementActivity",
        ),
    )
    val opened = runCatching {
        context.startActivity(xiaomi)
        true
    }.getOrDefault(false)
    if (!opened) {
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
        }
        runCatching { context.startActivity(fallback) }
            .onFailure {
                Toast.makeText(context, "No se pudieron abrir los ajustes", Toast.LENGTH_SHORT).show()
            }
    }
}
