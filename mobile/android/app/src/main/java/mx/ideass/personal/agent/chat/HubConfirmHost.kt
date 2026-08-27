package mx.ideass.personal.agent.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppColors
import mx.ideass.personal.agent.capabilities.AgentCapabilityUx

/**
 * Superficie HITL global (PHASE 38). Vive en AppNav, no en ChatScreen.
 * PHASE 41: nombres humanos vía [AgentCapabilityUx]; sin cambios de protocolo.
 */
@Composable
fun HubConfirmHost(
    viewModel: HubConfirmViewModel = hiltViewModel(),
) {
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val remaining by viewModel.remainingSeconds.collectAsStateWithLifecycle()
    val current = pending ?: return
    val presentation = AgentCapabilityUx.presentationFor(current.toolName)
    val capabilityLabel = presentation?.label ?: current.toolName

    AlertDialog(
        onDismissRequest = { viewModel.dismiss() },
        title = { Text(stringResource(R.string.hub_confirm_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.hub_confirm_capability, capabilityLabel),
                    fontSize = 16.sp,
                    color = AppColors.textPrimary,
                )
                presentation?.description?.let { description ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.hub_confirm_action, description),
                        fontSize = 14.sp,
                        color = AppColors.textMuted,
                    )
                }
                if (presentation?.requiresConfirmation != false) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.hub_confirm_side_effect),
                        fontSize = 14.sp,
                        color = AppColors.warn,
                    )
                }
                presentation?.platformHint?.let { hint ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = hint,
                        fontSize = 13.sp,
                        color = AppColors.textMuted,
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.hub_confirm_input, current.inputSummary),
                    fontSize = 13.sp,
                    color = AppColors.textPrimary,
                )
                val seconds = remaining
                if (seconds != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.hub_confirm_expires, seconds),
                        fontSize = 13.sp,
                        color = AppColors.textMuted,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { viewModel.approve() }) {
                Text(stringResource(R.string.hub_confirm_approve))
            }
        },
        dismissButton = {
            TextButton(onClick = { viewModel.reject() }) {
                Text(stringResource(R.string.hub_confirm_reject))
            }
        },
    )
}
