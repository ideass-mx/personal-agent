package mx.ideass.personal.agent.connection

import android.content.Context
import android.view.ViewGroup
import androidx.camera.core.ImageAnalysis
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Host CameraX + ML Kit QR. Emite solo [onRawDetected]; no parsea ni autentica.
 * No registra el valor escaneado.
 */
@Composable
fun CameraXQrScannerHost(
    enabled: Boolean,
    acceptDetections: Boolean,
    modifier: Modifier = Modifier,
    onRawDetected: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val accepting = remember { AtomicBoolean(acceptDetections) }
    val callbackRef = remember { AtomicReference(onRawDetected) }
    callbackRef.set(onRawDetected)
    accepting.set(acceptDetections)

    val cameraController = remember {
        createLifecycleCameraController(context) { raw ->
            if (accepting.get()) {
                callbackRef.get()?.invoke(raw)
            }
        }
    }

    DisposableEffect(lifecycleOwner, enabled) {
        if (enabled) {
            cameraController.bindToLifecycle(lifecycleOwner)
        } else {
            cameraController.unbind()
        }
        onDispose {
            cameraController.unbind()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            accepting.set(false)
            cameraController.clearImageAnalysisAnalyzer()
            cameraController.unbind()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PreviewView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                scaleType = PreviewView.ScaleType.FILL_CENTER
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                controller = cameraController
            }
        },
        update = { preview ->
            preview.controller = cameraController
        },
    )
}

private fun createLifecycleCameraController(
    context: Context,
    onRaw: (String) -> Unit,
): LifecycleCameraController {
    val options = BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build()
    val barcodeScanner = BarcodeScanning.getClient(options)
    val controller = LifecycleCameraController(context)
    val mainExecutor = ContextCompat.getMainExecutor(context)
    controller.setImageAnalysisAnalyzer(
        mainExecutor,
        MlKitAnalyzer(
            listOf(barcodeScanner),
            ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED,
            mainExecutor,
        ) { result ->
            val barcodes = result?.getValue(barcodeScanner) ?: return@MlKitAnalyzer
            val raw = barcodes.firstOrNull()?.rawValue?.trim().orEmpty()
            if (raw.isNotEmpty()) {
                onRaw(raw)
            }
        },
    )
    return controller
}
