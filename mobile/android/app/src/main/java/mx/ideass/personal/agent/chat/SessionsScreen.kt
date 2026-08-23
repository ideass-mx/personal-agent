package mx.ideass.personal.agent.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii

/**
 * Lista de sesiones.
 *
 * Borrado: long-press entra a modo selección (la principal no es seleccionable);
 * taps agregan/quitan; confirmación con conteo. Se eligió selección + menú de
 * acciones frente a swipe porque no había patrón swipe en la app y CP2 exige
 * multi-selección.
 */
@Composable
fun SessionsScreen(
    onBack: () -> Unit,
    onSessionSelected: () -> Unit = onBack,
    viewModel: SessionsViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()

    if (ui.pendingDeleteKeys.isNotEmpty()) {
        DeleteSessionsDialog(
            names = ui.pendingDeleteNames,
            count = ui.pendingDeleteKeys.size,
            deleting = ui.deleting,
            onConfirm = viewModel::confirmDelete,
            onDismiss = viewModel::dismissDeleteConfirm,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background)
            .imePadding(),
    ) {
        if (ui.selectionMode) {
            SelectionHeader(
                selectedCount = ui.selectedCount,
                deleting = ui.deleting,
                onExit = viewModel::exitSelection,
                onSelectAll = viewModel::selectAllDeletable,
                onDelete = { viewModel.requestDelete() },
            )
        } else {
            SessionsHeader(
                onBack = onBack,
                onCreate = viewModel::openCreate,
                createEnabled = !ui.creating,
            )
        }

        if (ui.errorMessage != null && !ui.showCreate) {
            Text(
                text = ui.errorMessage.orEmpty(),
                color = AppColors.warn,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        if (ui.showCreate) {
            CreateSessionPanel(
                draftName = ui.draftName,
                creating = ui.creating,
                connected = ui.connected,
                errorMessage = ui.errorMessage,
                onDraftChange = viewModel::onDraftNameChange,
                onCreate = viewModel::create,
                onCancel = viewModel::dismissCreate,
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(ui.sessions, key = { it.sessionKey }) { row ->
                SessionRow(
                    row = row,
                    selectionMode = ui.selectionMode,
                    onClick = {
                        if (ui.selectionMode) {
                            if (row.selectable) {
                                viewModel.toggleSelection(row.sessionKey)
                            }
                        } else {
                            viewModel.select(row.sessionKey)
                            onSessionSelected()
                        }
                    },
                    onLongClick = {
                        if (row.selectable) {
                            viewModel.enterSelection(row.sessionKey)
                        }
                    },
                )
            }
            if (ui.sessions.isEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.sessions_empty),
                        color = AppColors.textMuted,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(top = 24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DeleteSessionsDialog(
    names: List<String>,
    count: Int,
    deleting: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val title = if (count == 1) {
        stringResource(R.string.sessions_delete_confirm_title)
    } else {
        stringResource(R.string.sessions_delete_confirm_title_plural)
    }
    val body = if (count == 1) {
        stringResource(R.string.sessions_delete_confirm_one, names.firstOrNull().orEmpty())
    } else {
        stringResource(R.string.sessions_delete_confirm_many, count)
    }
    AlertDialog(
        onDismissRequest = { if (!deleting) onDismiss() },
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !deleting) {
                Text(stringResource(R.string.sessions_delete_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !deleting) {
                Text(stringResource(R.string.sessions_delete_cancel))
            }
        },
    )
}

@Composable
private fun SessionsHeader(
    onBack: () -> Unit,
    onCreate: () -> Unit,
    createEnabled: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.sessions_back),
                tint = AppColors.textMuted,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.sessions_title),
                color = AppColors.textPrimary,
                fontSize = 18.sp,
            )
            Text(
                text = stringResource(R.string.sessions_subtitle),
                color = AppColors.textMuted,
                fontSize = 13.sp,
            )
        }
        IconButton(onClick = onCreate, enabled = createEnabled) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = stringResource(R.string.sessions_new),
                tint = if (createEnabled) AppColors.accent else AppColors.textMuted,
            )
        }
    }
}

@Composable
private fun SelectionHeader(
    selectedCount: Int,
    deleting: Boolean,
    onExit: () -> Unit,
    onSelectAll: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onExit, enabled = !deleting) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = stringResource(R.string.sessions_selection_exit),
                tint = AppColors.textMuted,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = pluralStringResource(
                    R.plurals.sessions_selection_count,
                    selectedCount,
                    selectedCount,
                ),
                color = AppColors.textPrimary,
                fontSize = 18.sp,
            )
            Text(
                text = stringResource(R.string.sessions_select_all),
                color = AppColors.accent,
                fontSize = 13.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable(enabled = !deleting, onClick = onSelectAll)
                    .padding(vertical = 2.dp),
            )
        }
        IconButton(
            onClick = onDelete,
            enabled = !deleting && selectedCount > 0,
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = stringResource(
                    R.string.sessions_delete_action_count,
                    selectedCount,
                ),
                tint = if (!deleting && selectedCount > 0) AppColors.warn else AppColors.textMuted,
            )
        }
    }
}

@Composable
private fun CreateSessionPanel(
    draftName: String,
    creating: Boolean,
    connected: Boolean,
    errorMessage: String?,
    onDraftChange: (String) -> Unit,
    onCreate: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface)
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .padding(14.dp),
    ) {
        Text(
            text = stringResource(R.string.sessions_create_title),
            color = AppColors.textPrimary,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(
                if (connected) {
                    R.string.sessions_create_hint
                } else {
                    R.string.sessions_create_need_connection
                },
            ),
            color = AppColors.textMuted,
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(10.dp))
        BasicTextField(
            value = draftName,
            onValueChange = onDraftChange,
            enabled = !creating,
            singleLine = true,
            textStyle = TextStyle(color = AppColors.textPrimary, fontSize = 15.sp),
            cursorBrush = SolidColor(AppColors.accent),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(AppColors.background)
                .border(1.dp, AppColors.border, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            decorationBox = { inner ->
                if (draftName.isEmpty()) {
                    Text(
                        text = stringResource(R.string.sessions_create_name_placeholder),
                        color = AppColors.textMuted,
                        fontSize = 15.sp,
                    )
                }
                inner()
            },
        )
        if (errorMessage != null) {
            Spacer(Modifier.height(8.dp))
            Text(errorMessage, color = AppColors.warn, fontSize = 13.sp)
        }
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.sessions_delete_cancel),
                color = AppColors.textMuted,
                fontSize = 14.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(enabled = !creating, onClick = onCancel)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(
                    if (creating) R.string.sessions_creating else R.string.sessions_create,
                ),
                color = AppColors.onAccent,
                fontSize = 14.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(AppRadii.cta))
                    .background(
                        if (creating || !connected) {
                            AppColors.accent.copy(alpha = 0.45f)
                        } else {
                            AppColors.accent
                        },
                    )
                    .clickable(enabled = !creating && connected, onClick = onCreate)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
    Spacer(Modifier.height(8.dp))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SessionRow(
    row: SessionRowUi,
    selectionMode: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val borderColor = when {
        row.selected -> AppColors.accent
        row.isActive && !selectionMode -> AppColors.accent
        else -> AppColors.border
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadii.card))
            .background(
                if (row.selected) AppColors.accentTint else AppColors.surface,
            )
            .border(1.dp, borderColor, RoundedCornerShape(AppRadii.card))
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selectionMode) {
            SelectionCheckbox(selected = row.selected, enabled = row.selectable)
            Spacer(Modifier.width(12.dp))
        } else {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (row.isMain) AppColors.accentTint else AppColors.background),
                contentAlignment = Alignment.Center,
            ) {
                if (row.isMain) {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = null,
                        tint = AppColors.accent,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Text(
                        text = row.displayName.take(1).uppercase(),
                        color = AppColors.textMuted,
                        fontSize = 14.sp,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = row.displayName,
                    color = if (row.selectable || !selectionMode) {
                        AppColors.textPrimary
                    } else {
                        AppColors.textMuted
                    },
                    fontSize = 15.sp,
                    fontWeight = if (row.isMain || row.isActive) FontWeight.SemiBold else FontWeight.Normal,
                )
                if (row.isMain) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.sessions_badge_main),
                        color = AppColors.accent,
                        fontSize = 11.sp,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(AppColors.accentTint)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Text(
                text = if (row.isActive) {
                    stringResource(R.string.sessions_badge_active)
                } else {
                    row.sessionKey
                },
                color = if (row.isActive) AppColors.accent else AppColors.textMuted,
                fontSize = 12.sp,
                maxLines = 1,
            )
        }
        if (!selectionMode && row.isActive) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = stringResource(R.string.sessions_badge_active),
                tint = AppColors.accent,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun SelectionCheckbox(selected: Boolean, enabled: Boolean) {
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(CircleShape)
            .border(
                width = 2.dp,
                color = when {
                    !enabled -> AppColors.border
                    selected -> AppColors.accent
                    else -> AppColors.textMuted
                },
                shape = CircleShape,
            )
            .background(if (selected && enabled) AppColors.accent else AppColors.surface),
        contentAlignment = Alignment.Center,
    ) {
        if (selected && enabled) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = AppColors.onAccent,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
