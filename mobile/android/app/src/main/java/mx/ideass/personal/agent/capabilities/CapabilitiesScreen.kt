package mx.ideass.personal.agent.capabilities

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii
import mx.ideass.personal.agent.settings.SettingsHeader

/**
 * Lista estática de capacidades MVP (PHASE 41). No requiere conexión ni catálogo remoto.
 * Mostrar aquí no implica permiso de ejecución; Gateway sigue autorizando.
 */
@Composable
fun CapabilitiesScreen(
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        SettingsHeader(
            title = stringResource(R.string.capabilities_title),
            subtitle = stringResource(R.string.capabilities_subtitle),
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(R.string.capabilities_intro),
                color = AppColors.textMuted,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 4.dp),
            )
            AgentCapabilityUx.mvpCapabilities().forEach { capability ->
                CapabilityRow(capability = capability)
            }
        }
    }
}

@Composable
private fun CapabilityRow(capability: AgentCapabilityPresentation) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = iconFor(capability.category),
            contentDescription = null,
            tint = AppColors.textMuted,
            modifier = Modifier.size(24.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = capability.label,
                color = AppColors.textPrimary,
                fontSize = 16.sp,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = capability.description,
                color = AppColors.textMuted,
                fontSize = 13.sp,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.capabilities_status_available),
                color = AppColors.textPrimary,
                fontSize = 12.sp,
            )
            if (capability.requiresConfirmation) {
                Text(
                    text = stringResource(R.string.capabilities_status_requires_auth),
                    color = AppColors.warn,
                    fontSize = 12.sp,
                )
            }
            capability.platformHint?.let { hint ->
                Text(
                    text = hint,
                    color = AppColors.textMuted,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

private fun iconFor(category: AgentCapabilityCategory): ImageVector =
    when (category) {
        AgentCapabilityCategory.Files -> Icons.Default.Folder
        AgentCapabilityCategory.Pc -> Icons.Default.Build
        AgentCapabilityCategory.Excel -> Icons.Default.Description
    }
