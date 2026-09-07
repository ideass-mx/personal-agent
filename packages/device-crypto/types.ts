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
