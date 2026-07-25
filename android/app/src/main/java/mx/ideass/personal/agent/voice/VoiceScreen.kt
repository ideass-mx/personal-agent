package mx.ideass.personal.agent.voice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii
import kotlin.math.max

@Composable
fun VoiceScreen(
    onFinished: () -> Unit,
    viewModel: VoiceViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var showRationale by remember { mutableStateOf(!permissionGranted) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val micOk = result[Manifest.permission.RECORD_AUDIO] == true
        permissionGranted = micOk
        showRationale = false
        if (micOk) {
            viewModel.startSession()
        }
    }

    LaunchedEffect(permissionGranted) {
        if (permissionGranted && !showRationale) {
            viewModel.startSession()
        }
    }

    DisposableEffect(Unit) {
        onDispose { viewModel.endSession() }
    }

    fun requestPermissions() {
        val needed = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        }.toTypedArray()
        permissionLauncher.launch(needed)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        when {
            showRationale -> PermissionRationale(
                onAllow = { requestPermissions() },
                onDeny = onFinished,
            )
            !permissionGranted -> {
                ErrorPane(
                    message = stringResource(R.string.voice_error_permission),
                    onClose = onFinished,
                )
            }
            ui.errorMessage != null && ui.state is VoiceState.Idle -> {
                ErrorPane(
                    message = ui.errorMessage!!,
                    onClose = onFinished,
                )
            }
            else -> {
                VoiceSessionContent(
                    ui = ui,
                    onEnd = {
                        viewModel.endSession()
                        onFinished()
                    },
                )
            }
        }
    }
}

@Composable
private fun PermissionRationale(
    onAllow: () -> Unit,
    onDeny: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(CircleShape)
                .background(AppColors.accentTint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.Mic,
                contentDescription = null,
                tint = AppColors.accent,
                modifier = Modifier.size(40.dp),
            )
        }
        Spacer(Modifier.height(28.dp))
        Text(
            text = stringResource(R.string.voice_permission_title),
            color = AppColors.textPrimary,
            fontSize = 22.sp,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.voice_permission_body),
            color = AppColors.textMuted,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            lineHeight = 22.sp,
        )
        Spacer(Modifier.height(32.dp))
        TextButton(
            onClick = onAllow,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(AppRadii.cta))
                .background(AppColors.accent),
        ) {
            Text(
                text = stringResource(R.string.voice_permission_allow),
                color = AppColors.onAccent,
                fontSize = 16.sp,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onDeny) {
            Text(
                text = stringResource(R.string.voice_permission_deny),
                color = AppColors.textMuted,
                fontSize = 15.sp,
            )
        }
    }
}

@Composable
private fun ErrorPane(
    message: String,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            color = AppColors.warn,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            lineHeight = 24.sp,
        )
        Spacer(Modifier.height(28.dp))
        EndSessionButton(onClick = onClose)
    }
}

@Composable
internal fun VoiceSessionContent(
    ui: VoiceSessionUi,
    onEnd: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.weight(0.35f))

        VoiceOrb(ui = ui)

        Spacer(Modifier.height(28.dp))

        AnimatedContent(
            targetState = ui.state,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "voiceLabel",
        ) { state ->
            Text(
                text = stateLabel(state),
                color = stateColor(state),
                fontSize = 18.sp,
            )
        }

        Spacer(Modifier.height(20.dp))

        val underText = when (ui.state) {
            is VoiceState.Listening -> ui.userTranscript
            is VoiceState.Thinking -> ui.userTranscript
            is VoiceState.Speaking -> ui.agentText
            is VoiceState.Idle -> ""
        }
        Text(
            text = underText,
            color = AppColors.textPrimary,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            lineHeight = 24.sp,
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .padding(horizontal = 8.dp),
        )

        if (ui.errorMessage != null && ui.state !is VoiceState.Idle) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = ui.errorMessage,
                color = AppColors.warn,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(modifier = Modifier.weight(0.45f))

        EndSessionButton(onClick = onEnd)
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun EndSessionButton(onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadii.cta))
            .background(AppColors.surface)
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.cta)),
    ) {
        Text(
            text = stringResource(R.string.voice_end),
            color = AppColors.textPrimary,
            fontSize = 17.sp,
            modifier = Modifier.padding(vertical = 6.dp),
        )
    }
}

@Composable
private fun VoiceOrb(ui: VoiceSessionUi) {
    val state = ui.state
    val ringColor = stateColor(state)
    val centerColor = when (state) {
        is VoiceState.Thinking -> AppColors.surface
        is VoiceState.Speaking -> AppColors.speaking.copy(alpha = 0.22f)
        is VoiceState.Listening -> AppColors.accentTint
        is VoiceState.Idle -> AppColors.surface
    }

    val infinite = rememberInfiniteTransition(label = "orb")
    val pulse by infinite.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )
    val wave by infinite.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(520, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "wave",
    )

    // Amplitud del mic → escala de anillos (Listening).
    val rmsNorm = ((ui.rmsDb + 45f) / 45f).coerceIn(0.15f, 1f)
    val listenScale = if (state is VoiceState.Listening) 0.9f + rmsNorm * 0.35f else 1f

    Box(
        modifier = Modifier.size(220.dp),
        contentAlignment = Alignment.Center,
    ) {
        when (state) {
            is VoiceState.Listening -> {
                ConcentricRing(size = 220.dp, color = ringColor.copy(alpha = 0.18f), scale = listenScale)
                ConcentricRing(size = 170.dp, color = ringColor.copy(alpha = 0.32f), scale = listenScale * 0.98f)
                ConcentricRing(size = 128.dp, color = ringColor.copy(alpha = 0.5f), scale = max(1f, listenScale * 0.95f))
            }
            is VoiceState.Speaking -> {
                ConcentricRing(size = 210.dp, color = ringColor.copy(alpha = 0.2f), scale = wave)
                ConcentricRing(size = 160.dp, color = ringColor.copy(alpha = 0.35f), scale = wave * 0.96f)
            }
            is VoiceState.Thinking -> {
                ConcentricRing(size = 180.dp, color = ringColor.copy(alpha = 0.22f), scale = pulse)
            }
            is VoiceState.Idle -> {
                ConcentricRing(size = 160.dp, color = ringColor.copy(alpha = 0.25f), scale = 1f)
            }
        }

        Box(
            modifier = Modifier
                .size(100.dp)
                .clip(CircleShape)
                .background(centerColor)
                .border(2.dp, ringColor.copy(alpha = 0.55f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            when (state) {
                is VoiceState.Listening -> Icon(
                    imageVector = Icons.Default.Mic,
                    contentDescription = null,
                    tint = AppColors.accent,
                    modifier = Modifier.size(40.dp),
                )
                is VoiceState.Thinking -> CircularProgressIndicator(
                    color = AppColors.warn,
                    strokeWidth = 3.dp,
                    modifier = Modifier
                        .size(36.dp)
                        .alpha(0.95f),
                )
                is VoiceState.Speaking -> Icon(
                    imageVector = Icons.Default.GraphicEq,
                    contentDescription = null,
                    tint = AppColors.speakingText,
                    modifier = Modifier
                        .size(40.dp)
                        .scale(wave),
                )
                is VoiceState.Idle -> Icon(
                    imageVector = Icons.Default.MicOff,
                    contentDescription = null,
                    tint = AppColors.idle,
                    modifier = Modifier.size(40.dp),
                )
            }
        }
    }
}

@Composable
private fun ConcentricRing(
    size: androidx.compose.ui.unit.Dp,
    color: Color,
    scale: Float,
) {
    Box(
        modifier = Modifier
            .size(size)
            .scale(scale)
            .border(2.dp, color, CircleShape),
    )
}

@Composable
private fun stateLabel(state: VoiceState): String = when (state) {
    is VoiceState.Listening -> stringResource(R.string.voice_listening)
    is VoiceState.Thinking -> stringResource(R.string.voice_thinking)
    is VoiceState.Speaking -> stringResource(R.string.voice_speaking)
    is VoiceState.Idle -> stringResource(R.string.voice_idle)
}

private fun stateColor(state: VoiceState): Color = when (state) {
    is VoiceState.Listening -> AppColors.accent
    is VoiceState.Thinking -> AppColors.warn
    is VoiceState.Speaking -> AppColors.speakingText
    is VoiceState.Idle -> AppColors.idle
}
