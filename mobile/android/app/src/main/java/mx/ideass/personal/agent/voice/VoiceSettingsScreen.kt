package mx.ideass.personal.agent.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.settings.SettingsHeader

/**
 * Sección de ajustes de voz neuronal (catálogo, descarga, speaker, muestra).
 * Misma lógica que antes vivía embebida en la pantalla de conexión.
 */
@Composable
fun VoiceSettingsScreen(
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.background),
    ) {
        SettingsHeader(
            title = stringResource(R.string.settings_section_voice),
            subtitle = stringResource(R.string.settings_section_voice_subtitle),
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            NeuralVoiceSettingsSection()
        }
    }
}
