package mx.ideass.personal.agent.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState
import javax.inject.Inject

/**
 * HITL Hub global (PHASE 38): consume [ChatStore.pendingHubConfirm] por encima de ChatScreen.
 * Approve/Reject → [ChatConnection.sendConfirmResponse]. Dismiss = reject.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HubConfirmViewModel @Inject constructor(
    private val chatStore: ChatStore,
    private val chatConnection: ChatConnection,
) : ViewModel() {

    val pending: StateFlow<HubConfirmPending?> = chatStore.pendingHubConfirm

    /**
     * Segundos restantes para UX. Al llegar a 0 limpia UI local sin aprobar
     * (Gateway sigue siendo autoridad del timeout).
     */
    val remainingSeconds: StateFlow<Int?> = pending
        .flatMapLatest { current ->
            if (current == null) {
                flowOf<Int?>(null)
            } else {
                flow<Int?> {
                    while (true) {
                        val left = HubConfirmUx.remainingSeconds(current.receivedAtMs)
                        emit(left)
                        if (left <= 0) {
                            if (chatStore.pendingHubConfirm.value?.confirmationId ==
                                current.confirmationId
                            ) {
                                chatStore.clearPendingHubConfirm()
                            }
                            break
                        }
                        delay(1_000)
                    }
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        viewModelScope.launch {
            chatConnection.connectionState.collect { state ->
                if (state !is ConnectionState.Conectado) {
                    chatStore.clearPendingHubConfirm()
                }
            }
        }
    }

    fun approve() = respond(approved = true)

    fun reject() = respond(approved = false)

    /** Dismiss / atrás = reject fail-closed. */
    fun dismiss() = reject()

    private fun respond(approved: Boolean) {
        val current = chatStore.pendingHubConfirm.value ?: return
        chatStore.recordConfirmResponse(approved)
        chatConnection.sendConfirmResponse(current.confirmationId, approved)
        chatStore.clearPendingHubConfirm()
    }
}
