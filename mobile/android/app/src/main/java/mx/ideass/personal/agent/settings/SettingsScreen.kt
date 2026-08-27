package mx.ideass.personal.agent.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii

/**
 * Hub de ajustes: lista de secciones → cada una abre su subpantalla.
 * Solo navegación; la lógica de cada ajuste vive en su sección.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenConnection: () -> Unit,
    onOpenVoice: () -> Unit,
    onOpenCapabilities: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        SettingsHeader(
            title = stringResource(R.string.settings_title),
            subtitle = stringResource(R.string.settings_subtitle),
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SettingsSectionRow(
                title = stringResource(R.string.settings_section_connection),
                subtitle = stringResource(R.string.settings_section_connection_subtitle),
                onClick = onOpenConnection,
            )
            SettingsSectionRow(
                title = stringResource(R.string.settings_section_voice),
                subtitle = stringResource(R.string.settings_section_voice_subtitle),
                onClick = onOpenVoice,
            )
            SettingsSectionRow(
                title = stringResource(R.string.settings_section_capabilities),
                subtitle = stringResource(R.string.settings_section_capabilities_subtitle),
                onClick = onOpenCapabilities,
            )
        }
    }
}

@Composable
fun SettingsHeader(
    title: String,
    subtitle: String? = null,
    onBack: () -> Unit,
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
                contentDescription = stringResource(R.string.settings_back),
                tint = AppColors.textMuted,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = AppColors.textPrimary,
                fontSize = 18.sp,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    color = AppColors.textMuted,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

@Composable
private fun SettingsSectionRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = AppColors.textPrimary,
                fontSize = 16.sp,
            )
            Spacer(modifier = Modifier.padding(top = 2.dp))
            Text(
                text = subtitle,
                color = AppColors.textMuted,
                fontSize = 13.sp,
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = AppColors.textMuted,
        )
    }
}
