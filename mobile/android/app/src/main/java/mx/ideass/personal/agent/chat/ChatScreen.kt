package mx.ideass.personal.agent.chat

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
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii
import mx.ideass.personal.agent.app.streamingCursorAlpha
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.workspace.ConversationWorkspaceUiState
import mx.ideass.personal.agent.workspace.label

@Composable
fun ChatScreen(
    onOpenSettings: () -> Unit,
    onOpenVoice: (sessionKey: String) -> Unit,
    onOpenSessions: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val workspace by viewModel.workspace.collectAsStateWithLifecycle()
    val connection by viewModel.connectionState.collectAsStateWithLifecycle()
    val hadConnection by viewModel.hadConnection.collectAsStateWithLifecycle()
    val history by viewModel.historyHydration.collectAsStateWithLifecycle()
    val toolActivity by viewModel.toolActivity.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val degraded = hadConnection && connection !is ConnectionState.Conectado
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.reloadConversationWorkspace()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(ui.messages.size, ui.messages.lastOrNull()?.text) {
        if (ui.messages.isNotEmpty()) {
            listState.animateScrollToItem(ui.messages.lastIndex)
        }
    }

    // HITL global: HubConfirmHost en AppNav (PHASE 38).


    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background)
            .imePadding(),
    ) {
        ChatHeader(
            connection = connection,
            activeSessionName = ui.activeSessionName,
            workspace = workspace,
            onOpenSettings = onOpenSettings,
            onOpenSessions = onOpenSessions,
            onOpenWorkspaceMenu = viewModel::openWorkspaceMenu,
            onCloseWorkspaceMenu = viewModel::closeWorkspaceMenu,
            onSelectWorkspace = viewModel::selectConversationWorkspace,
            onOpenCreateWorkspace = viewModel::openCreateWorkspace,
        )

        workspace.errorMessage?.let { message ->
            Text(
                text = message,
                color = AppColors.warn,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        if (degraded) {
            DegradedBanner()
        }

        when {
            history.status == HistoryHydrationStatus.Loading && ui.messages.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = OperationalCopy.historyLoading(),
                        color = AppColors.textMuted,
                        fontSize = 14.sp,
                    )
                }
            }
            history.status == HistoryHydrationStatus.Error -> {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = OperationalCopy.historyError(),
                        color = AppColors.warn,
                        fontSize = 14.sp,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(onClick = viewModel::retryHistory) {
                        Text("Reintentar", color = AppColors.accent)
                    }
                    if (ui.messages.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(16.dp))
                        LazyColumn(
                            state = listState,
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                            contentPadding = PaddingValues(vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(ui.messages, key = { it.id }) { message ->
                                MessageBubble(
                                    message = message,
                                    lastToolName = toolActivity?.toolName,
                                )
                            }
                            toolActivity?.let { activity ->
                                item(key = "tool_activity_${activity.phase}") {
                                    ToolActivityBanner(activity)
                                }
                            }
                        }
                    }
                }
            }
            ui.messages.isEmpty() -> {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 28.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = OperationalCopy.chatEmptyTitle(),
                        color = AppColors.textPrimary,
                        fontSize = 22.sp,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = if (history.status == HistoryHydrationStatus.Ready) {
                            OperationalCopy.historyEmpty()
                        } else {
                            OperationalCopy.chatEmptyBody()
                        },
                        color = AppColors.textMuted,
                        fontSize = 14.sp,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    TextButton(onClick = onOpenSessions) {
                        Text("Nueva conversación", color = AppColors.accent)
                    }
                }
            }
            else -> {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(ui.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            lastToolName = toolActivity?.toolName,
                        )
                    }
                    toolActivity?.let { activity ->
                        item(key = "tool_activity_${activity.phase}") {
                            ToolActivityBanner(activity)
                        }
                    }
                }
            }
        }

        ChatInputBar(
            draft = ui.draft,
            onDraftChange = viewModel::onDraftChange,
            onSend = viewModel::send,
            micEnabled = connection is ConnectionState.Conectado &&
                ui.activeSessionKey.isNotBlank(),
            onMicClick = {
                val key = ui.activeSessionKey.trim()
                if (key.isNotEmpty()) onOpenVoice(key)
            },
        )
    }

    if (workspace.createDialogOpen) {
        AlertDialog(
            onDismissRequest = viewModel::closeCreateWorkspace,
            title = { Text("Nuevo Workspace") },
            text = {
                BasicTextField(
                    value = workspace.createName,
                    onValueChange = viewModel::onCreateWorkspaceName,
                    textStyle = TextStyle(color = AppColors.textPrimary, fontSize = 15.sp),
                    cursorBrush = SolidColor(AppColors.accent),
                    decorationBox = { inner ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(AppColors.surface, RoundedCornerShape(8.dp))
                                .padding(12.dp),
                        ) {
                            if (workspace.createName.isEmpty()) {
                                Text("Nombre", color = AppColors.textMuted, fontSize = 15.sp)
                            }
                            inner()
                        }
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.createWorkspace(useAfterCreate = true) },
                    enabled = !workspace.creating,
                ) {
                    Text("Crear y usar")
                }
            },
            dismissButton = {
                Row {
                    TextButton(
                        onClick = { viewModel.createWorkspace(useAfterCreate = false) },
                        enabled = !workspace.creating,
                    ) {
                        Text("Solo crear")
                    }
                    TextButton(onClick = viewModel::closeCreateWorkspace) {
                        Text("Cancelar")
                    }
                }
            },
        )
    }
}

@Composable
private fun ChatHeader(
    connection: ConnectionState,
    activeSessionName: String,
    workspace: ConversationWorkspaceUiState,
    onOpenSettings: () -> Unit,
    onOpenSessions: () -> Unit,
    onOpenWorkspaceMenu: () -> Unit,
    onCloseWorkspaceMenu: () -> Unit,
    onSelectWorkspace: (String?) -> Unit,
    onOpenCreateWorkspace: () -> Unit,
) {
    val (subtitle, subtitleColor) = when (connection) {
        is ConnectionState.Conectado ->
            OperationalCopy.connectionHeaderLabel(
                connected = true,
                reconnecting = false,
                unconfigured = false,
            ) to AppColors.accent
        is ConnectionState.Reconectando -> {
            val base = OperationalCopy.connectionHeaderLabel(
                connected = false,
                reconnecting = true,
                unconfigured = false,
            )
            val label = if (connection.segundos > 0) {
                "$base · reintento en ${connection.segundos}s"
            } else {
                "$base…"
            }
            label to AppColors.warn
        }
        is ConnectionState.Emparejando -> "Emparejando…" to AppColors.warn
        is ConnectionState.Error ->
            OperationalCopy.connectionHeaderLabel(
                connected = false,
                reconnecting = false,
                unconfigured = false,
            ) to AppColors.warn
        is ConnectionState.SinConfigurar ->
            OperationalCopy.connectionHeaderLabel(
                connected = false,
                reconnecting = false,
                unconfigured = true,
            ) to AppColors.warn
    }
    val sessionLabel = activeSessionName.ifBlank { "Sesiones" }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .padding(start = 8.dp)
                .size(40.dp)
                .clip(CircleShape)
                .background(AppColors.accentTint),
            contentAlignment = Alignment.Center,
        ) {
            Text("A", color = AppColors.accent, fontSize = 18.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onOpenSessions)
                .padding(vertical = 4.dp),
        ) {
            Text("Agente", color = AppColors.textPrimary, fontSize = 18.sp)
            Text(
                text = "$subtitle · $sessionLabel",
                color = subtitleColor,
                fontSize = 13.sp,
                maxLines = 1,
            )
            if (workspace.hubAvailable) {
                Box {
                    Text(
                        text = workspace.label() +
                            if (workspace.saving) " · guardando" else "",
                        color = AppColors.textMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        modifier = Modifier
                            .clickable(onClick = onOpenWorkspaceMenu)
                            .padding(top = 2.dp),
                    )
                    DropdownMenu(
                        expanded = workspace.menuOpen,
                        onDismissRequest = onCloseWorkspaceMenu,
                    ) {
                        workspace.workspaces.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.name) },
                                onClick = { onSelectWorkspace(item.id) },
                            )
                        }
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Sin Workspace") },
                            onClick = { onSelectWorkspace(null) },
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("+ Nuevo Workspace") },
                            onClick = onOpenCreateWorkspace,
                        )
                    }
                }
            }
        }
        IconButton(onClick = onOpenSessions) {
            Icon(
                imageVector = Icons.Default.Forum,
                contentDescription = "Sesiones",
                tint = AppColors.textMuted,
            )
        }
        IconButton(onClick = onOpenSettings) {
            Icon(
                imageVector = Icons.Default.Settings,
                contentDescription = stringResource(R.string.settings_open),
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
            text = OperationalCopy.degradedBannerText(),
            color = AppColors.warn,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun ToolActivityBanner(activity: ToolActivityState) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        activity.capabilityLabel?.let { label ->
            Text(
                text = label,
                color = AppColors.textPrimary,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(4.dp))
        }
        Text(
            text = ToolActivityUx.statusLabel(activity.phase),
            color = when (activity.phase) {
                ToolActivityPhase.Failed -> AppColors.warn
                ToolActivityPhase.AwaitingAuth -> AppColors.warn
                else -> AppColors.textMuted
            },
            fontSize = 13.sp,
        )
        activity.platformNote?.let { note ->
            Spacer(Modifier.height(6.dp))
            Text(
                text = note,
                color = AppColors.textMuted,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    lastToolName: String? = null,
) {
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
            val displayText = if (message.fromUser || message.streaming) {
                message.text
            } else {
                ToolResultUx.presentInConversation(message.text, lastToolName)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = displayText,
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
            enabled = micEnabled,
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
