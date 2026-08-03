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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii

@Composable
fun SessionsScreen(
    onBack: () -> Unit,
    onSessionSelected: () -> Unit = onBack,
    viewModel: SessionsViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background)
            .imePadding(),
    ) {
        SessionsHeader(
            onBack = onBack,
            onCreate = viewModel::openCreate,
            createEnabled = !ui.creating,
        )

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
                    onClick = {
                        viewModel.select(row.sessionKey)
                        onSessionSelected()
                    },
                )
            }
            if (ui.sessions.isEmpty()) {
                item {
                    Text(
                        text = "Aún no hay sesiones. Conéctate al agente para cargar la principal.",
                        color = AppColors.textMuted,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(top = 24.dp),
                    )
                }
            }
        }

        // TODO: renombrar / archivar / borrar sesiones
    }
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
                contentDescription = "Volver",
                tint = AppColors.textMuted,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text("Sesiones", color = AppColors.textPrimary, fontSize = 18.sp)
            Text(
                text = "Toca una para cambiar de hilo",
                color = AppColors.textMuted,
                fontSize = 13.sp,
            )
        }
        IconButton(onClick = onCreate, enabled = createEnabled) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "Nueva sesión",
                tint = if (createEnabled) AppColors.accent else AppColors.textMuted,
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
        Text("Nueva sesión", color = AppColors.textPrimary, fontSize = 15.sp)
        Spacer(Modifier.height(4.dp))
        Text(
            text = if (connected) {
                "Dale un nombre (p. ej. Trabajo, Domótica)"
            } else {
                "Necesitas conexión con el agente para crear"
            },
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
                    Text("Nombre", color = AppColors.textMuted, fontSize = 15.sp)
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
                text = "Cancelar",
                color = AppColors.textMuted,
                fontSize = 14.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(enabled = !creating, onClick = onCancel)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = if (creating) "Creando…" else "Crear",
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

@Composable
private fun SessionRow(
    row: SessionRowUi,
    onClick: () -> Unit,
) {
    val borderColor = when {
        row.isActive -> AppColors.accent
        else -> AppColors.border
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface)
            .border(1.dp, borderColor, RoundedCornerShape(AppRadii.card))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
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
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = row.displayName,
                    color = AppColors.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = if (row.isMain || row.isActive) FontWeight.SemiBold else FontWeight.Normal,
                )
                if (row.isMain) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "principal",
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
                text = if (row.isActive) "activa" else row.sessionKey,
                color = if (row.isActive) AppColors.accent else AppColors.textMuted,
                fontSize = 12.sp,
                maxLines = 1,
            )
        }
        if (row.isActive) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Activa",
                tint = AppColors.accent,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
