package mx.ideass.personal.agent.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.app.AppRadii

@Composable
fun TtsSettingsSection(
    viewModel: TtsSettingsViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppColors.border, RoundedCornerShape(AppRadii.card))
            .background(AppColors.surface, RoundedCornerShape(AppRadii.card))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.tts_settings_title),
            color = AppColors.textPrimary,
            fontSize = 18.sp,
        )
        Text(
            text = stringResource(R.string.tts_settings_subtitle),
            color = AppColors.textMuted,
            fontSize = 13.sp,
        )

        Text(
            text = stringResource(R.string.tts_settings_engine_label),
            color = AppColors.textPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )

        if (ui.loadingEngines) {
            CircularProgressIndicator(
                modifier = Modifier
                    .height(28.dp)
                    .align(Alignment.CenterHorizontally),
                color = AppColors.accent,
                strokeWidth = 2.dp,
            )
        } else {
            EngineRow(
                label = stringResource(R.string.tts_settings_engine_system),
                selected = ui.selectedEnginePackage == null,
                onClick = viewModel::selectSystemEngine,
            )
            ui.engines.forEach { engine ->
                EngineRow(
                    label = engine.label,
                    subtitle = engine.packageName,
                    selected = ui.selectedEnginePackage == engine.packageName,
                    onClick = { viewModel.selectEngine(engine.packageName) },
                )
            }
            if (ui.engines.isEmpty()) {
                Text(
                    text = stringResource(R.string.tts_settings_engines_empty),
                    color = AppColors.warn,
                    fontSize = 13.sp,
                )
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.tts_settings_voice_label),
                color = AppColors.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            TextButton(onClick = viewModel::clearVoice) {
                Text(
                    text = stringResource(R.string.tts_settings_voice_auto_action),
                    color = AppColors.accent,
                    fontSize = 12.sp,
                )
            }
        }

        if (ui.loadingVoices) {
            CircularProgressIndicator(
                modifier = Modifier
                    .height(28.dp)
                    .align(Alignment.CenterHorizontally),
                color = AppColors.accent,
                strokeWidth = 2.dp,
            )
        } else if (ui.voices.isEmpty()) {
            Text(
                text = stringResource(R.string.tts_settings_voices_empty),
                color = AppColors.textMuted,
                fontSize = 13.sp,
            )
        } else {
            ui.voices.forEach { voice ->
                VoiceRow(
                    voice = voice,
                    selected = ui.selectedVoiceName == voice.name,
                    previewing = ui.previewingVoiceName == voice.name,
                    onSelect = { viewModel.selectVoice(voice.name) },
                    onPreview = { viewModel.previewVoice(voice.name) },
                )
            }
        }

        ui.statusMessage?.let { message ->
            Text(
                text = message,
                color = if (ui.statusWarn) AppColors.warn else AppColors.accent,
                fontSize = 13.sp,
            )
        }

        OutlinedButton(
            onClick = viewModel::refresh,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(AppRadii.cta),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AppColors.accent),
        ) {
            Text(stringResource(R.string.tts_settings_refresh))
        }
    }
}

@Composable
private fun EngineRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    subtitle: String? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (selected) AppColors.accent else AppColors.border,
                shape = RoundedCornerShape(AppRadii.card),
            )
            .background(
                if (selected) AppColors.accentTint else AppColors.background,
                RoundedCornerShape(AppRadii.card),
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Text(label, color = AppColors.textPrimary, fontSize = 14.sp)
        if (subtitle != null) {
            Text(subtitle, color = AppColors.textMuted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun VoiceRow(
    voice: TtsVoicePolicy.VoiceInfo,
    selected: Boolean,
    previewing: Boolean,
    onSelect: () -> Unit,
    onPreview: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = when {
                    selected -> AppColors.accent
                    voice.isEsMx -> AppColors.speaking
                    else -> AppColors.border
                },
                shape = RoundedCornerShape(AppRadii.card),
            )
            .background(
                when {
                    selected -> AppColors.accentTint
                    voice.isEsMx -> AppColors.surface
                    else -> AppColors.background
                },
                RoundedCornerShape(AppRadii.card),
            )
            .clickable(onClick = onSelect)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = voice.displayLabel,
                color = AppColors.textPrimary,
                fontSize = 13.sp,
            )
            if (voice.isEsMx) {
                Text(
                    text = stringResource(R.string.tts_settings_voice_es_mx_badge),
                    color = AppColors.speakingText,
                    fontSize = 11.sp,
                )
            }
        }
        TextButton(
            onClick = onPreview,
            enabled = !previewing,
        ) {
            if (previewing) {
                CircularProgressIndicator(
                    modifier = Modifier.height(16.dp),
                    color = AppColors.accent,
                    strokeWidth = 2.dp,
                )
            } else {
                Text(
                    text = stringResource(R.string.tts_settings_preview),
                    color = AppColors.accent,
                    fontSize = 12.sp,
                )
            }
        }
    }
}
