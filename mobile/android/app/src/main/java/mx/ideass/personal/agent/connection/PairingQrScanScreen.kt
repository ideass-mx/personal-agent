package mx.ideass.personal.agent.connection

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii

/**
 * Pantalla de scanner QR real (cámara). Al éxito entrega raw URI al caller
 * (mismo camino que pegar URI → [PairingQrParser] → pairing).
 */
@Composable
fun PairingQrScanScreen(
    onValidUri: (String) -> Unit,
    onEnterManually: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val controller = remember { PairingQrScanController() }
    var phase by remember { mutableStateOf(controller.phase) }
    var error by remember { mutableStateOf<String?>(null) }

    fun syncUi() {
        phase = controller.phase
        error = controller.lastError
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            controller.onPermissionGranted()
        } else {
            val permanently = activity != null &&
                !ActivityCompat.shouldShowRequestPermissionRationale(
                    activity,
                    Manifest.permission.CAMERA,
                )
            controller.onPermissionDenied(permanentlyDenied = permanently)
        }
        syncUi()
    }

    fun requestCamera() {
        controller.onOpenScanner()
        syncUi()
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            controller.onPermissionGranted()
            syncUi()
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    DisposableEffect(Unit) {
        requestCamera()
        onDispose {
            controller.onLeave()
        }
    }

    BackHandler {
        controller.onLeave()
        onBack()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = {
                controller.onLeave()
                onBack()
            }) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Volver",
                    tint = AppColors.textPrimary,
                )
            }
            Text(
                text = "Escanear código QR",
                color = AppColors.textPrimary,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center),
            )
        }

        when (phase) {
            PairingQrScanPhase.REQUESTING_PERMISSION,
            PairingQrScanPhase.IDLE,
            -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Solicitando cámara…", color = AppColors.textMuted)
                }
            }

            PairingQrScanPhase.PERMISSION_DENIED -> {
                PermissionDeniedBody(
                    permanently = false,
                    onTryAgain = { requestCamera() },
                    onEnterManually = {
                        controller.onLeave()
                        onEnterManually()
                    },
                    onOpenSettings = null,
                )
            }

            PairingQrScanPhase.PERMISSION_PERMANENTLY_DENIED -> {
                PermissionDeniedBody(
                    permanently = true,
                    onTryAgain = null,
                    onEnterManually = {
                        controller.onLeave()
                        onEnterManually()
                    },
                    onOpenSettings = {
                        val intent = Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null),
                        )
                        context.startActivity(intent)
                    },
                )
            }

            PairingQrScanPhase.SCANNING,
            PairingQrScanPhase.PROCESSING,
            PairingQrScanPhase.INVALID_QR,
            PairingQrScanPhase.PAIRING,
            -> {
                Box(modifier = Modifier.fillMaxSize()) {
                    if (phase != PairingQrScanPhase.PAIRING) {
                        CameraXQrScannerHost(
                            enabled = controller.shouldRunCamera(),
                            acceptDetections = controller.isAcceptingDetections(),
                            modifier = Modifier.fillMaxSize(),
                            onRawDetected = { raw ->
                                when (val outcome = controller.onRawDetected(raw)) {
                                    is QrDetectOutcome.Valid -> {
                                        syncUi()
                                        onValidUri(outcome.uri)
                                    }
                                    is QrDetectOutcome.Invalid -> {
                                        controller.resumeScanning()
                                        syncUi()
                                        error = outcome.message
                                        phase = PairingQrScanPhase.SCANNING
                                    }
                                    QrDetectOutcome.Ignored -> Unit
                                }
                            },
                        )
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.SpaceBetween,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Spacer(modifier = Modifier.height(48.dp))
                        Box(
                            modifier = Modifier
                                .size(240.dp)
                                .border(
                                    width = 2.dp,
                                    color = AppColors.accent,
                                    shape = RoundedCornerShape(AppRadii.card),
                                ),
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Apunta la cámara al código QR\nmostrado en tu PC.",
                                color = AppColors.textPrimary,
                                fontSize = 15.sp,
                            )
                            val visibleError = error
                            if (!visibleError.isNullOrBlank() &&
                                phase == PairingQrScanPhase.SCANNING
                            ) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = visibleError,
                                    color = AppColors.warn,
                                    fontSize = 14.sp,
                                )
                            }
                            if (phase == PairingQrScanPhase.PROCESSING ||
                                phase == PairingQrScanPhase.PAIRING
                            ) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Procesando…",
                                    color = AppColors.accent,
                                    fontSize = 14.sp,
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedButton(
                                onClick = {
                                    controller.onLeave()
                                    onEnterManually()
                                },
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = AppColors.textMuted,
                                ),
                            ) {
                                Text("Introducir código manualmente")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionDeniedBody(
    permanently: Boolean,
    onTryAgain: (() -> Unit)?,
    onEnterManually: () -> Unit,
    onOpenSettings: (() -> Unit)?,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = if (permanently) {
                "El permiso de cámara está desactivado.\nActívalo en Ajustes de Android para escanear códigos QR."
            } else {
                "Se necesita acceso a la cámara para escanear el código QR de emparejamiento."
            },
            color = AppColors.textPrimary,
            fontSize = 16.sp,
        )
        Spacer(modifier = Modifier.height(24.dp))
        if (onTryAgain != null) {
            Button(
                onClick = onTryAgain,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = AppColors.accent),
            ) {
                Text("Reintentar")
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
        if (onOpenSettings != null) {
            Button(
                onClick = onOpenSettings,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = AppColors.accent),
            ) {
                Text("Abrir Ajustes")
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
        OutlinedButton(
            onClick = onEnterManually,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.textMuted),
        ) {
            Text("Introducir manualmente")
        }
    }
}
