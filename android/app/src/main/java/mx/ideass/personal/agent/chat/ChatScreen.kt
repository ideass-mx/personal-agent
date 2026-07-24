package mx.ideass.personal.agent.chat

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii
import mx.ideass.personal.agent.app.streamingCursorAlpha
import mx.ideass.personal.agent.network.ConnectionState

@Composable
fun ChatScreen(
    onOpenConnection: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val connection by viewModel.connectionState.collectAsStateWithLifecycle()
    val hadConnection by viewModel.hadConnection.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val degraded = hadConnection && connection !is ConnectionState.Conectado

    LaunchedEffect(ui.messages.size, ui.messages.lastOrNull()?.text) {
        if (ui.messages.isNotEmpty()) {
            listState.animateScrollToItem(ui.messages.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background)
            .imePadding(),
    ) {
        ChatHeader(
            connection = connection,
            onOpenConnection = onOpenConnection,
        )

        if (degraded) {
            DegradedBanner()
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(ui.messages, key = { it.id }) { message ->
                MessageBubble(message)
            }
        }

        ChatInputBar(
            draft = ui.draft,
            onDraftChange = viewModel::onDraftChange,
            onSend = viewModel::send,
            micEnabled = connection is ConnectionState.Conectado,
            onMicClick = {
                Toast.makeText(context, "la voz llega pronto", Toast.LENGTH_SHORT).show()
            },
        )
    }
}

@Composable
private fun ChatHeader(
    connection: ConnectionState,
    onOpenConnection: () -> Unit,
) {
    val (subtitle, subtitleColor) = when (connection) {
        is ConnectionState.Conectado -> "en línea" to AppColors.accent
        is ConnectionState.Reconectando -> {
            val label = if (connection.segundos > 0) {
                "reconectando · reintento en ${connection.segundos}s"
            } else {
                "reconectando…"
            }
            label to AppColors.warn
        }
        is ConnectionState.SinConfigurar -> "sin configurar" to AppColors.warn
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(AppColors.accentTint),
            contentAlignment = Alignment.Center,
        ) {
            Text("A", color = AppColors.accent, fontSize = 18.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text("Agente", color = AppColors.textPrimary, fontSize = 18.sp)
            Text(subtitle, color = subtitleColor, fontSize = 13.sp)
        }
        IconButton(onClick = onOpenConnection) {
            Icon(
                imageVector = Icons.Default.Settings,
                contentDescription = "Ajustes de conexión",
                tint = AppColors.textMuted,
            )
        }
    }
}

@Composable
private fun DegradedBanner() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColors.warnTint)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            tint = AppColors.warn,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = "Sin conexión con tu hub. Tus mensajes se enviarán al reconectar.",
            color = AppColors.warn,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val maxBubble = (LocalConfiguration.current.screenWidthDp * 0.78f).dp
    val shape = if (message.fromUser) {
        RoundedCornerShape(
            topStart = AppRadii.bubble,
            topEnd = AppRadii.bubble,
            bottomStart = AppRadii.bubble,
            bottomEnd = AppRadii.bubbleOrigin,
        )
    } else {
        RoundedCornerShape(
            topStart = AppRadii.bubble,
            topEnd = AppRadii.bubble,
            bottomStart = AppRadii.bubbleOrigin,
            bottomEnd = AppRadii.bubble,
        )
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (message.fromUser) Alignment.End else Alignment.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = maxBubble)
                .alpha(if (message.queued) 0.55f else 1f)
                .background(
                    color = if (message.fromUser) AppColors.accentTint else AppColors.surface,
                    shape = shape,
                )
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = message.text,
                    color = if (message.fromUser) AppColors.userText else AppColors.textPrimary,
                    fontSize = 15.sp,
                )
                if (message.streaming) {
                    Spacer(Modifier.width(2.dp))
                    Box(
                        modifier = Modifier
                            .padding(bottom = 2.dp)
                            .width(7.dp)
                            .height(16.dp)
                            .alpha(streamingCursorAlpha())
                            .background(AppColors.accent, RoundedCornerShape(2.dp)),
                    )
                }
            }
            if (message.queued) {
                Spacer(Modifier.height(4.dp))
                Text("en cola", color = AppColors.warn, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    draft: String,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    micEnabled: Boolean,
    onMicClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(AppRadii.card))
                .background(AppColors.surface)
                .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = draft,
                onValueChange = onDraftChange,
                modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = AppColors.textPrimary, fontSize = 15.sp),
                cursorBrush = SolidColor(AppColors.accent),
                decorationBox = { inner ->
                    if (draft.isEmpty()) {
                        Text("Escribe un mensaje…", color = AppColors.textMuted, fontSize = 15.sp)
                    }
                    inner()
                },
            )
            if (draft.isNotBlank()) {
                Text(
                    text = "Enviar",
                    color = AppColors.accent,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(AppColors.accentTint)
                        .clickable(onClick = onSend)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        IconButton(
            onClick = onMicClick,
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(
                    if (micEnabled) AppColors.accent else AppColors.accent.copy(alpha = 0.35f),
                )
                .alpha(if (micEnabled) 1f else 0.55f),
        ) {
            Icon(
                imageVector = Icons.Default.Mic,
                contentDescription = "Micrófono",
                tint = AppColors.onAccent,
            )
        }
    }
}
