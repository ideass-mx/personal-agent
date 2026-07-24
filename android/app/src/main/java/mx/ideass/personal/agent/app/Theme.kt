package mx.ideass.personal.agent.app

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object AppColors {
    val background = Color(0xFF101214)
    val surface = Color(0xFF1A1D21)
    val border = Color(0xFF2A2E34)
    val textPrimary = Color(0xFFECEDEE)
    val textMuted = Color(0xFF8A8F98)
    val accent = Color(0xFF5DCAA5)
    val onAccent = Color(0xFF04342C)
    val accentTint = Color(0xFF24332E)
    val userText = Color(0xFFD9EFE6)
    val warn = Color(0xFFFAC775)
    val warnTint = Color(0xFF2E2417)
}

object AppRadii {
    val card = 10.dp
    val bubble = 16.dp
    val bubbleOrigin = 4.dp
    val cta = 12.dp
}

private val DarkScheme = darkColorScheme(
    primary = AppColors.accent,
    onPrimary = AppColors.onAccent,
    background = AppColors.background,
    onBackground = AppColors.textPrimary,
    surface = AppColors.surface,
    onSurface = AppColors.textPrimary,
    outline = AppColors.border,
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        content = content,
    )
}

/** Cursor de streaming: bloque accent que parpadea. */
@Composable
fun streamingCursorAlpha(): Float {
    val transition = rememberInfiniteTransition(label = "cursor")
    val alpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 530),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "cursorAlpha",
    )
    return alpha
}
