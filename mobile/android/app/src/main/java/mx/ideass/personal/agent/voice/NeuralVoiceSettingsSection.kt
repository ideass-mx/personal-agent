package mx.ideass.personal.agent.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import kotlin.math.roundToInt

@Composable
fun NeuralVoiceSettingsSection(
    viewModel: NeuralVoiceSettingsViewModel = hiltViewModel(),
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
            text = stringResource(R.string.neural_voice_settings_title),
            color = AppColors.textPrimary,
            fontSize = 18.sp,
        )
        Text(
            text = stringResource(R.string.neural_voice_settings_subtitle),
            color = AppColors.textMuted,
            fontSize = 13.sp,
        )

        if (ui.rows.isEmpty()) {
            Text(
                text = stringResource(R.string.neural_voice_catalog_empty),
                color = AppColors.warn,
                fontSize = 13.sp,
            )
        } else {
            ui.rows.forEach { row ->
                if (row.isGrouped) {
                    GroupedMultiSpeakerVoiceRow(
                        row = row,
                        previewing = ui.previewingVoiceId == row.entry.id,
                        onDownload = { viewModel.download(row.entry.id) },
                        onCancel = { viewModel.cancelDownload(row.entry.id) },
                        onActivate = { viewModel.activate(row.entry.id) },
                        onDelete = { viewModel.delete(row.entry.id) },
                        onPreview = { viewModel.preview(row.entry.id) },
                        onSelectCombo = { lang, sid ->
                            val pkg = row.entry.installId()
                            when (row.entry.engineType()) {
                                NeuralVoiceEngine.Kokoro ->
                                    viewModel.selectKokoroCombo(pkg, lang, sid)
                                else ->
                                    viewModel.selectSupertonicCombo(pkg, lang, sid)
                            }
                        },
                    )
                } else {
                    NeuralVoiceRow(
                        row = row,
                        previewing = ui.previewingVoiceId == row.entry.id,
                        onDownload = { viewModel.download(row.entry.id) },
                        onCancel = { viewModel.cancelDownload(row.entry.id) },
                        onActivate = { viewModel.activate(row.entry.id) },
                        onDelete = { viewModel.delete(row.entry.id) },
                        onPreview = { viewModel.preview(row.entry.id) },
                    )
                }
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
            Text(stringResource(R.string.neural_voice_refresh))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupedMultiSpeakerVoiceRow(
    row: NeuralVoiceRowModel,
    previewing: Boolean,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    onActivate: () -> Unit,
    onDelete: () -> Unit,
    onPreview: () -> Unit,
    onSelectCombo: (lang: String, sid: Int) -> Unit,
) {
    val selected = row.kind == NeuralVoiceRowKind.Active
    val langs = row.groupEntries.map { it.language }.distinct()
    val speakersForLang = row.groupEntries
        .filter { it.language.equals(row.entry.language, ignoreCase = true) }
        .sortedBy { it.speakerId }
    val hintRes = when (row.entry.engineType()) {
        NeuralVoiceEngine.Kokoro -> R.string.neural_voice_kokoro_hint
        else -> R.string.neural_voice_supertonic_hint
    }
    // Kokoro: idioma primero (filtra speakers). Supertonic: speaker × idioma.
    val langFirst = row.entry.engineType() == NeuralVoiceEngine.Kokoro

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
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = row.entry.displayName,
                    color = AppColors.textPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = stringResource(
                        R.string.neural_voice_meta_line,
                        NeuralVoiceSettingsPolicy.langLabel(row.entry),
                        NeuralVoiceSettingsPolicy.engineLabel(row.entry.engine),
                        row.entry.sizeMB,
                    ),
                    color = AppColors.textMuted,
                    fontSize = 12.sp,
                )
                Text(
                    text = stringResource(hintRes),
                    color = AppColors.textMuted,
                    fontSize = 11.sp,
                )
            }
            Text(
                text = statusLabel(row),
                color = when (row.kind) {
                    NeuralVoiceRowKind.Active -> AppColors.accent
                    NeuralVoiceRowKind.Failed -> AppColors.warn
                    else -> AppColors.textMuted
                },
                fontSize = 12.sp,
            )
        }

        if (row.kind == NeuralVoiceRowKind.Downloading) {
            val fraction = row.progressFraction
            if (fraction != null && fraction > 0f) {
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColors.accent,
                    trackColor = AppColors.border,
                )
                Text(
                    text = stringResource(
                        R.string.neural_voice_progress_pct,
                        (fraction * 100).roundToInt(),
                    ),
                    color = AppColors.textMuted,
                    fontSize = 11.sp,
                )
            } else {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColors.accent,
                    trackColor = AppColors.border,
                )
            }
        }

        if (row.kind == NeuralVoiceRowKind.Extracting) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = AppColors.accent,
                trackColor = AppColors.border,
            )
        }

        if (row.kind == NeuralVoiceRowKind.Failed && !row.errorMessage.isNullOrBlank()) {
            Text(
                text = row.errorMessage,
                color = AppColors.warn,
                fontSize = 12.sp,
            )
        }

        val canPick = row.kind == NeuralVoiceRowKind.Installed ||
            row.kind == NeuralVoiceRowKind.Active
        if (canPick) {
            val engine = row.entry.engineType()
            val langOptions = langs.map {
                NeuralVoiceSettingsPolicy.langLabel(engine, it) to it
            }
            val speakerOptions = speakersForLang.map {
                NeuralVoiceSettingsPolicy.speakerLabel(it) to it.speakerId
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (langFirst) {
                    CompactDropdown(
                        label = stringResource(R.string.neural_voice_lang_label),
                        value = NeuralVoiceSettingsPolicy.langLabel(row.entry),
                        options = langOptions,
                        modifier = Modifier.weight(1f),
                        onSelect = { langCode ->
                            val keep = row.groupEntries.firstOrNull {
                                it.language.equals(langCode, ignoreCase = true) &&
                                    it.speakerId == row.entry.speakerId
                            }
                            val sid = keep?.speakerId
                                ?: row.groupEntries
                                    .filter { it.language.equals(langCode, ignoreCase = true) }
                                    .minByOrNull { it.speakerId }
                                    ?.speakerId
                                ?: return@CompactDropdown
                            onSelectCombo(langCode, sid)
                        },
                    )
                    CompactDropdown(
                        label = stringResource(R.string.neural_voice_speaker_label),
                        value = NeuralVoiceSettingsPolicy.speakerLabel(row.entry),
                        options = speakerOptions,
                        modifier = Modifier.weight(1f),
                        onSelect = { sid -> onSelectCombo(row.entry.language, sid) },
                    )
                } else {
                    CompactDropdown(
                        label = stringResource(R.string.neural_voice_speaker_label),
                        value = NeuralVoiceSettingsPolicy.speakerLabel(row.entry),
                        options = speakerOptions,
                        modifier = Modifier.weight(1f),
                        onSelect = { sid -> onSelectCombo(row.entry.language, sid) },
                    )
                    CompactDropdown(
                        label = stringResource(R.string.neural_voice_lang_label),
                        value = NeuralVoiceSettingsPolicy.langLabel(row.entry),
                        options = langOptions,
                        modifier = Modifier.weight(1f),
                        onSelect = { langCode ->
                            val keep = row.groupEntries.firstOrNull {
                                it.language.equals(langCode, ignoreCase = true) &&
                                    it.speakerId == row.entry.speakerId
                            }
                            val sid = keep?.speakerId
                                ?: row.groupEntries
                                    .filter { it.language.equals(langCode, ignoreCase = true) }
                                    .minByOrNull { it.speakerId }
                                    ?.speakerId
                                ?: return@CompactDropdown
                            onSelectCombo(langCode, sid)
                        },
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when (row.kind) {
                NeuralVoiceRowKind.NotInstalled, NeuralVoiceRowKind.Failed -> {
                    TextButton(onClick = onDownload) {
                        Text(
                            stringResource(R.string.neural_voice_download),
                            color = AppColors.accent,
                            fontSize = 12.sp,
                        )
                    }
                }
                NeuralVoiceRowKind.Downloading, NeuralVoiceRowKind.Extracting -> {
                    TextButton(onClick = onCancel) {
                        Text(
                            stringResource(R.string.neural_voice_cancel),
                            color = AppColors.warn,
                            fontSize = 12.sp,
                        )
                    }
                }
                NeuralVoiceRowKind.Installed, NeuralVoiceRowKind.Active -> {
                    if (row.kind != NeuralVoiceRowKind.Active) {
                        TextButton(onClick = onActivate) {
                            Text(
                                stringResource(R.string.neural_voice_activate),
                                color = AppColors.accent,
                                fontSize = 12.sp,
                            )
                        }
                    }
                    TextButton(onClick = onPreview, enabled = !previewing) {
                        if (previewing) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .height(16.dp)
                                    .width(16.dp),
                                color = AppColors.accent,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text(
                                stringResource(R.string.neural_voice_preview),
                                color = AppColors.accent,
                                fontSize = 12.sp,
                            )
                        }
                    }
                    TextButton(onClick = onDelete) {
                        Text(
                            stringResource(R.string.neural_voice_delete),
                            color = AppColors.warn,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> CompactDropdown(
    label: String,
    value: String,
    options: List<Pair<String, T>>,
    modifier: Modifier = Modifier,
    onSelect: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label, fontSize = 11.sp) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = AppColors.textPrimary,
                unfocusedTextColor = AppColors.textPrimary,
                focusedBorderColor = AppColors.accent,
                unfocusedBorderColor = AppColors.border,
                focusedLabelColor = AppColors.textMuted,
                unfocusedLabelColor = AppColors.textMuted,
            ),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { (labelText, key) ->
                DropdownMenuItem(
                    text = { Text(labelText, fontSize = 13.sp) },
                    onClick = {
                        expanded = false
                        onSelect(key)
                    },
                )
            }
        }
    }
}

@Composable
private fun NeuralVoiceRow(
    row: NeuralVoiceRowModel,
    previewing: Boolean,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    onActivate: () -> Unit,
    onDelete: () -> Unit,
    onPreview: () -> Unit,
) {
    val selected = row.kind == NeuralVoiceRowKind.Active
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
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = row.entry.displayName,
                    color = AppColors.textPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = stringResource(
                        R.string.neural_voice_meta_line,
                        row.entry.language,
                        NeuralVoiceSettingsPolicy.engineLabel(row.entry.engine),
                        row.entry.sizeMB,
                    ),
                    color = AppColors.textMuted,
                    fontSize = 12.sp,
                )
                if (row.entry.recommended) {
                    Text(
                        text = stringResource(R.string.neural_voice_recommended_badge),
                        color = AppColors.speakingText,
                        fontSize = 11.sp,
                    )
                }
            }
            Text(
                text = statusLabel(row),
                color = when (row.kind) {
                    NeuralVoiceRowKind.Active -> AppColors.accent
                    NeuralVoiceRowKind.Failed -> AppColors.warn
                    else -> AppColors.textMuted
                },
                fontSize = 12.sp,
            )
        }

        if (row.kind == NeuralVoiceRowKind.Downloading) {
            val fraction = row.progressFraction
            if (fraction != null && fraction > 0f) {
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColors.accent,
                    trackColor = AppColors.border,
                )
                Text(
                    text = stringResource(
                        R.string.neural_voice_progress_pct,
                        (fraction * 100).roundToInt(),
                    ),
                    color = AppColors.textMuted,
                    fontSize = 11.sp,
                )
            } else {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = AppColors.accent,
                    trackColor = AppColors.border,
                )
            }
        }

        if (row.kind == NeuralVoiceRowKind.Extracting) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = AppColors.accent,
                trackColor = AppColors.border,
            )
        }

        if (row.kind == NeuralVoiceRowKind.Failed && !row.errorMessage.isNullOrBlank()) {
            Text(
                text = row.errorMessage,
                color = AppColors.warn,
                fontSize = 12.sp,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when (row.kind) {
                NeuralVoiceRowKind.NotInstalled, NeuralVoiceRowKind.Failed -> {
                    TextButton(onClick = onDownload) {
                        Text(
                            stringResource(R.string.neural_voice_download),
                            color = AppColors.accent,
                            fontSize = 12.sp,
                        )
                    }
                }
                NeuralVoiceRowKind.Downloading, NeuralVoiceRowKind.Extracting -> {
                    TextButton(onClick = onCancel) {
                        Text(
                            stringResource(R.string.neural_voice_cancel),
                            color = AppColors.warn,
                            fontSize = 12.sp,
                        )
                    }
                }
                NeuralVoiceRowKind.Installed, NeuralVoiceRowKind.Active -> {
                    if (row.kind != NeuralVoiceRowKind.Active) {
                        TextButton(onClick = onActivate) {
                            Text(
                                stringResource(R.string.neural_voice_activate),
                                color = AppColors.accent,
                                fontSize = 12.sp,
                            )
                        }
                    }
                    TextButton(
                        onClick = onPreview,
                        enabled = !previewing,
                    ) {
                        if (previewing) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .height(16.dp)
                                    .width(16.dp),
                                color = AppColors.accent,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text(
                                stringResource(R.string.neural_voice_preview),
                                color = AppColors.accent,
                                fontSize = 12.sp,
                            )
                        }
                    }
                    TextButton(onClick = onDelete) {
                        Text(
                            stringResource(R.string.neural_voice_delete),
                            color = AppColors.warn,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun statusLabel(row: NeuralVoiceRowModel): String = when (row.kind) {
    NeuralVoiceRowKind.NotInstalled -> stringResource(R.string.neural_voice_status_not_installed)
    NeuralVoiceRowKind.Downloading -> stringResource(R.string.neural_voice_status_downloading)
    NeuralVoiceRowKind.Extracting -> stringResource(R.string.neural_voice_status_extracting)
    NeuralVoiceRowKind.Failed -> stringResource(R.string.neural_voice_status_failed)
    NeuralVoiceRowKind.Installed -> stringResource(R.string.neural_voice_status_installed)
    NeuralVoiceRowKind.Active -> stringResource(R.string.neural_voice_status_active)
}
