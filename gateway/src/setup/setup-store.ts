/**
 * Persistencia de SetupState en SQLite (sin secretos).
 */
import { db } from "../db/database.ts";
import {
  SetupStates,
  canTransitionSetupState,
  flagsForSetupState,
  isSetupState,
  type SetupState,
  type SetupStateRecord,
} from "./types.ts";

const ROW_ID = "default";

type Row = {
  id: string;
  state: string;
  installation_ready: number;
  llm_configured: number;
  verified: number;
  onboarding_completed: number;
  llm_provider: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  updated_at: string;
};

function rowToRecord(row: Row): SetupStateRecord {
  if (!isSetupState(row.state)) {
    throw new Error(`setup_state: estado inválido ${row.state}`);
  }
  return {
    state: row.state,
    installationReady: Boolean(row.installation_ready),
    llmConfigured: Boolean(row.llm_configured),
    verified: Boolean(row.verified),
    onboardingCompleted: Boolean(row.onboarding_completed),
    llmProvider: row.llm_provider,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    updatedAt: row.updated_at,
  };
}

function buildRecord(
  state: SetupState,
  patch: {
    llmProvider?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    /** When true, keep explicit error flags instead of pure derivation. */
    preserveErrorFlags?: boolean;
    installationReady?: boolean;
    llmConfigured?: boolean;
    verified?: boolean;
    onboardingCompleted?: boolean;
  } = {},
): SetupStateRecord {
  const derived = flagsForSetupState(state);
  const updatedAt = new Date().toISOString();
  return {
    state,
    installationReady:
      patch.installationReady !== undefined
        ? patch.installationReady
        : derived.installationReady,
    llmConfigured:
      patch.llmConfigured !== undefined
        ? patch.llmConfigured
        : derived.llmConfigured,
    verified:
      patch.verified !== undefined ? patch.verified : derived.verified,
    onboardingCompleted:
      patch.onboardingCompleted !== undefined
        ? patch.onboardingCompleted
        : derived.onboardingCompleted,
    llmProvider:
      patch.llmProvider !== undefined ? patch.llmProvider : null,
    lastErrorCode:
      patch.lastErrorCode !== undefined ? patch.lastErrorCode : null,
    lastErrorMessage:
      patch.lastErrorMessage !== undefined ? patch.lastErrorMessage : null,
    updatedAt,
  };
}

function writeRecord(record: SetupStateRecord): SetupStateRecord {
  db.prepare(
    `INSERT INTO setup_state (
      id, state, installation_ready, llm_configured, verified,
      onboarding_completed, llm_provider, last_error_code, last_error_message, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      installation_ready = excluded.installation_ready,
      llm_configured = excluded.llm_configured,
      verified = excluded.verified,
      onboarding_completed = excluded.onboarding_completed,
      llm_provider = excluded.llm_provider,
      last_error_code = excluded.last_error_code,
      last_error_message = excluded.last_error_message,
      updated_at = excluded.updated_at`,
  ).run(
    ROW_ID,
    record.state,
    record.installationReady ? 1 : 0,
    record.llmConfigured ? 1 : 0,
    record.verified ? 1 : 0,
    record.onboardingCompleted ? 1 : 0,
    record.llmProvider,
    record.lastErrorCode,
    record.lastErrorMessage,
    record.updatedAt,
  );
  return record;
}

/**
 * Default when Gateway is up and no row exists: AGENT_READY.
 * Installer/Electron prove components; LLM onboarding comes later (Web UI).
 */
export function defaultSetupRecord(): SetupStateRecord {
  return buildRecord(SetupStates.AGENT_READY);
}

export function readSetupState(): SetupStateRecord | null {
  const row = db
    .prepare("SELECT * FROM setup_state WHERE id = ?")
    .get(ROW_ID) as Row | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

/** Load or initialize AGENT_READY (idempotent). */
export function ensureSetupState(): SetupStateRecord {
  const existing = readSetupState();
  if (existing) return existing;
  return writeRecord(defaultSetupRecord());
}

export function getSetupState(): SetupStateRecord {
  return ensureSetupState();
}

/**
 * Transition to a new setup state. Rejects illegal edges.
 * Same-state READY is allowed (idempotent).
 */
export function transitionSetupState(
  to: SetupState,
  patch: {
    llmProvider?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  } = {},
): SetupStateRecord {
  if (!isSetupState(to)) {
    throw new Error(`setup_state: destino inválido ${String(to)}`);
  }
  const current = ensureSetupState();
  if (!canTransitionSetupState(current.state, to)) {
    throw new Error(
      `setup_state: transición ilegal ${current.state} → ${to}`,
    );
  }
  const isError =
    to === SetupStates.INSTALLATION_ERROR ||
    to === SetupStates.GATEWAY_ERROR ||
    to === SetupStates.LLM_CONFIGURATION_ERROR ||
    to === SetupStates.LLM_CONNECTION_ERROR ||
    to === SetupStates.VERIFICATION_ERROR;

  const next = buildRecord(to, {
    llmProvider:
      patch.llmProvider !== undefined
        ? patch.llmProvider
        : current.llmProvider,
    lastErrorCode: isError
      ? (patch.lastErrorCode ?? current.lastErrorCode)
      : null,
    lastErrorMessage: isError
      ? (patch.lastErrorMessage ?? current.lastErrorMessage)
      : null,
    // Preserve installationReady across non-install errors
    installationReady:
      to === SetupStates.INSTALLATION_ERROR
        ? false
        : current.installationReady ||
          flagsForSetupState(to).installationReady,
  });
  return writeRecord(next);
}

/** Test / recovery helper: replace record without edge checks. */
export function replaceSetupStateForTests(record: SetupStateRecord): SetupStateRecord {
  if (!isSetupState(record.state)) {
    throw new Error(`setup_state: estado inválido`);
  }
  return writeRecord({
    ...record,
    updatedAt: new Date().toISOString(),
  });
}
