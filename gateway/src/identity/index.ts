/**
 * PHASE 57.2 — Identity Foundation + PHASE 57.3 Session + PHASE 57.4 Owner.
 */
export {
  LOCAL_USER_ID,
  DEFAULT_PERSONAL_AGENT_ID,
  DEFAULT_USER_DISPLAY_NAME,
  DEFAULT_PERSONAL_AGENT_NAME,
} from "./types.ts";
export type {
  User,
  PersonalAgent,
  PersonalAgentStatus,
  UserContext,
  AuthKindCompat,
  EnsureLocalIdentityResult,
} from "./types.ts";
export {
  getUserById,
  getPersonalAgentById,
  getPersonalAgentByUserId,
  annotateTrustedDevicesOwnership,
  setTrustedDeviceOwnership,
  updateUserDisplayName,
  isUserProfileComplete,
} from "./store.ts";
export { ensureLocalIdentity } from "./ensure-local.ts";
export {
  resolveUserContext,
  resolveUserContextFromAuthSession,
  assertHubTokenIsNotUserId,
  assertHubTokenIsNotSessionId,
  type ResolveUserContextInput,
} from "./context.ts";
export type {
  AuthSession,
  AuthSessionStatus,
  SessionScope,
  IssueAuthSessionInput,
} from "./auth-session-types.ts";
export {
  AUTH_SESSION_BROWSER_TTL_MS,
  AUTH_SESSION_DEVICE_TTL_MS,
} from "./auth-session-types.ts";
export {
  getAuthSessionById,
  getAuthSessionByCredential,
  issueAuthSession,
  issueInstallCompatSession,
  touchAuthSession,
  expireOverdueAuthSessions,
  listActiveAuthSessionIdsByDevice,
} from "./auth-session-store.ts";
export {
  userContextFromAuthSession,
  resolveUserContextFromSessionId,
  resolveInstallCompatSession,
  resolveDeviceAuthSession,
  resolveBrowserAuthSession,
  issueBrowserAuthSession,
} from "./auth-session-resolve.ts";
export {
  revokeSession,
  isSessionActive,
  revokeSessionsForDevice,
} from "./auth-session.ts";
export {
  isAgentOwner,
  assertAgentOwner,
  isInstallCompatTransport,
  type OwnerCheckResult,
} from "./owner.ts";
export {
  revokeTrustedDevice,
  type RevokeTrustedDeviceResult,
} from "./device-revoke.ts";
export {
  issueDeviceAuthChallenge,
  verifyDeviceAuthSignature,
  DEVICE_AUTH_CHALLENGE_TTL_MS,
  type DeviceAuthFailureReason,
} from "./device-auth.ts";
export {
  getTrustedDeviceCrypto,
  setDevicePublicKey,
  isPublicKeyTakenByOtherDevice,
  type DeviceIdentityStatus,
  type TrustedDeviceCryptoRow,
} from "./device-crypto-store.ts";
export { ensureHostTrustedDevice } from "./ensure-host-device.ts";
