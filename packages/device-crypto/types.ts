/**
 * PHASE 57.8 — Device cryptographic identity (shared helpers).
 *
 * privateKey stays on device via DeviceKeyStore.
 * Gateway only verifies with publicKey.
 */

/** Domain separation for DeviceAuth signatures. */
export const DEVICE_AUTH_DOMAIN = "PersonalAgent" as const;
export const DEVICE_AUTH_PURPOSE = "DeviceAuth" as const;
export const DEVICE_AUTH_PROTOCOL_VERSION = "1" as const;
export const DEVICE_KEY_ALGORITHM = "Ed25519" as const;

/** Domain separation for Personal Agent Cloud Auth (PHASE 62.1). */
export const CLOUD_AUTH_DOMAIN = "PersonalAgent" as const;
export const CLOUD_AUTH_PURPOSE = "CloudAuth" as const;
export const CLOUD_AUTH_PROTOCOL_VERSION = "1" as const;
export const CLOUD_AUTH_AUDIENCE = "personal-agent-cloud" as const;

export type DeviceKeyAlgorithm = typeof DEVICE_KEY_ALGORITHM;

export type DevicePublicKeyIdentity = {
  readonly publicKey: string;
  readonly keyAlgorithm: DeviceKeyAlgorithm;
};

/**
 * Secure key store. Implementations must never expose getPrivateKey().
 * Platform: Windows DPAPI/CNG, macOS Keychain, Linux Secret Service, Android Keystore.
 */
export interface DeviceKeyStore {
  generate(): Promise<DevicePublicKeyIdentity>;
  getPublicKey(): Promise<DevicePublicKeyIdentity | null>;
  /** Sign domain-separated auth payload; private key never leaves the store. */
  sign(payload: Uint8Array): Promise<string>;
  delete(): Promise<void>;
}

/**
 * Canonical bytes to sign / verify for device challenge-response.
 *
 * Format (UTF-8, LF-separated):
 *   PersonalAgent
 *   DeviceAuth
 *   1
 *   {deviceId}
 *   {challengeHex}
 */
export function buildDeviceAuthMessage(input: {
  deviceId: string;
  challengeHex: string;
}): Buffer {
  const body = [
    DEVICE_AUTH_DOMAIN,
    DEVICE_AUTH_PURPOSE,
    DEVICE_AUTH_PROTOCOL_VERSION,
    input.deviceId,
    input.challengeHex.toLowerCase(),
  ].join("\n");
  return Buffer.from(body, "utf8");
}

/**
 * Canonical bytes to sign / verify for Cloud Auth challenge-response.
 *
 * Format (UTF-8, LF-separated):
 *   PersonalAgent
 *   CloudAuth
 *   1
 *   personal-agent-cloud
 *   {deviceId}
 *   {challengeHex}
 *   {timestampIso}
 */
export function buildCloudAuthMessage(input: {
  deviceId: string;
  challengeHex: string;
  timestampIso: string;
  audience?: string;
}): Buffer {
  const body = [
    CLOUD_AUTH_DOMAIN,
    CLOUD_AUTH_PURPOSE,
    CLOUD_AUTH_PROTOCOL_VERSION,
    input.audience || CLOUD_AUTH_AUDIENCE,
    input.deviceId,
    input.challengeHex.toLowerCase(),
    input.timestampIso,
  ].join("\n");
  return Buffer.from(body, "utf8");
}
