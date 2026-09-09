/**
 * Product setup / onboarding state (Gateway source of truth).
 * Desktop onboarding.json is legacy UI state — this store is for Web UI + recovery.
 */
export const SetupStates = {
  INSTALLING: "INSTALLING",
  INSTALLED: "INSTALLED",
  AGENT_READY: "AGENT_READY",
  ONBOARDING: "ONBOARDING",
  LLM_REQUIRED: "LLM_REQUIRED",
  LLM_CONNECTED: "LLM_CONNECTED",
  VERIFYING: "VERIFYING",
  VERIFIED: "VERIFIED",
  READY: "READY",
  INSTALLATION_ERROR: "INSTALLATION_ERROR",
  GATEWAY_ERROR: "GATEWAY_ERROR",
  LLM_CONFIGURATION_ERROR: "LLM_CONFIGURATION_ERROR",
  LLM_CONNECTION_ERROR: "LLM_CONNECTION_ERROR",
  VERIFICATION_ERROR: "VERIFICATION_ERROR",
} as const;

export type SetupState = (typeof SetupStates)[keyof typeof SetupStates];

const ALL = new Set<string>(Object.values(SetupStates));

export function isSetupState(value: unknown): value is SetupState {
  return typeof value === "string" && ALL.has(value);
}

/** Record persisted in Gateway storage (no secrets). */
export type SetupStateRecord = {
  state: SetupState;
  installationReady: boolean;
  llmConfigured: boolean;
  verified: boolean;
  onboardingCompleted: boolean;
  /** Selected provider id when known — never an API key. */
  llmProvider: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
};

export type SetupStatusDto = {
  ok: true;
  state: SetupState;
  installationReady: boolean;
  llmConfigured: boolean;
  verified: boolean;
  onboardingCompleted: boolean;
  llmProvider: string | null;
  intelligenceMode?: "local" | "personal-agent-cloud" | "external";
  lastError: { code: string; message: string } | null;
  updatedAt: string;
};

/** Derive boolean flags from canonical state (single source). */
export function flagsForSetupState(state: SetupState): {
  installationReady: boolean;
  llmConfigured: boolean;
  verified: boolean;
  onboardingCompleted: boolean;
} {
  const order = [
    SetupStates.INSTALLING,
    SetupStates.INSTALLED,
    SetupStates.AGENT_READY,
    SetupStates.ONBOARDING,
    SetupStates.LLM_REQUIRED,
    SetupStates.LLM_CONNECTED,
    SetupStates.VERIFYING,
    SetupStates.VERIFIED,
    SetupStates.READY,
  ];
  const idx = order.indexOf(state as (typeof order)[number]);
  if (idx < 0) {
    // Error states: keep prior semantics via explicit record fields when loading;
    // for pure derivation, installation may still be ready except INSTALLATION_ERROR.
    return {
      installationReady: state !== SetupStates.INSTALLATION_ERROR,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
    };
  }
  return {
    installationReady: idx >= order.indexOf(SetupStates.AGENT_READY),
    llmConfigured: idx >= order.indexOf(SetupStates.LLM_CONNECTED),
    verified: idx >= order.indexOf(SetupStates.VERIFIED),
    onboardingCompleted: state === SetupStates.READY,
  };
}

export function toSetupStatusDto(record: SetupStateRecord): SetupStatusDto {
  return {
    ok: true,
    state: record.state,
    installationReady: record.installationReady,
    llmConfigured: record.llmConfigured,
    verified: record.verified,
    onboardingCompleted: record.onboardingCompleted,
    llmProvider: record.llmProvider,
    lastError:
      record.lastErrorCode && record.lastErrorMessage
        ? { code: record.lastErrorCode, message: record.lastErrorMessage }
        : record.lastErrorCode
          ? { code: record.lastErrorCode, message: record.lastErrorCode }
          : null,
    updatedAt: record.updatedAt,
  };
}

/**
 * Allowed forward / recovery edges for product setup.
 * READY → READY is idempotent.
 */
const EDGES: Record<SetupState, readonly SetupState[]> = {
  INSTALLING: [SetupStates.INSTALLED, SetupStates.INSTALLATION_ERROR],
  INSTALLED: [SetupStates.AGENT_READY, SetupStates.GATEWAY_ERROR],
  AGENT_READY: [
    SetupStates.ONBOARDING,
    SetupStates.LLM_REQUIRED,
    SetupStates.GATEWAY_ERROR,
  ],
  ONBOARDING: [SetupStates.LLM_REQUIRED, SetupStates.GATEWAY_ERROR],
  LLM_REQUIRED: [
    SetupStates.LLM_CONNECTED,
    SetupStates.LLM_CONFIGURATION_ERROR,
  ],
  LLM_CONFIGURATION_ERROR: [SetupStates.LLM_REQUIRED],
  LLM_CONNECTED: [
    SetupStates.VERIFYING,
    SetupStates.LLM_CONNECTION_ERROR,
    SetupStates.LLM_REQUIRED,
  ],
  LLM_CONNECTION_ERROR: [
    SetupStates.LLM_CONNECTED,
    SetupStates.LLM_REQUIRED,
    SetupStates.VERIFYING,
  ],
  VERIFYING: [SetupStates.VERIFIED, SetupStates.VERIFICATION_ERROR],
  VERIFICATION_ERROR: [
    SetupStates.VERIFYING,
    SetupStates.LLM_REQUIRED,
    SetupStates.LLM_CONNECTED,
  ],
  VERIFIED: [SetupStates.READY, SetupStates.LLM_REQUIRED],
  READY: [SetupStates.READY, SetupStates.LLM_REQUIRED],
  INSTALLATION_ERROR: [SetupStates.INSTALLING, SetupStates.INSTALLED],
  GATEWAY_ERROR: [
    SetupStates.INSTALLED,
    SetupStates.AGENT_READY,
    SetupStates.ONBOARDING,
  ],
};

export function canTransitionSetupState(
  from: SetupState,
  to: SetupState,
): boolean {
  if (from === to && from === SetupStates.READY) return true;
  if (from === to) return false;
  return (EDGES[from] ?? []).includes(to);
}
