/**
 * Seal provider for Windows DeviceKeyStore.
 *
 * Production: Windows DPAPI (CryptProtectData / CryptUnprotectData).
 * CNG KSP cannot sign with Ed25519 (PHASE 57.8 algorithm) — see docs.
 *
 * Tests: inject a fake seal that is NOT production-safe.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type WindowsSealProvider = {
  protect(plaintext: Buffer, entropy: Buffer): Buffer;
  unprotect(ciphertext: Buffer, entropy: Buffer): Buffer;
};

export type WindowsDpapiScope = "CurrentUser" | "LocalMachine";

/**
 * Load native DPAPI binding. Fails clearly when not on Windows or missing module.
 * Does not log or return key material.
 */
export async function loadWindowsDpapiSeal(
  scope: WindowsDpapiScope = "CurrentUser",
): Promise<WindowsSealProvider> {
  if (process.platform !== "win32") {
    throw new Error(
      "WindowsDeviceKeyStore: DPAPI solo disponible en Windows.",
    );
  }
  let Dpapi: {
    protectData: (
      data: Uint8Array,
      entropy: Uint8Array | null,
      scope: WindowsDpapiScope,
    ) => Uint8Array;
    unprotectData: (
      data: Uint8Array,
      entropy: Uint8Array | null,
      scope: WindowsDpapiScope,
    ) => Uint8Array;
  };
  try {
    const mod = await import("@primno/dpapi");
    Dpapi = mod.Dpapi;
  } catch {
    throw new Error(
      "WindowsDeviceKeyStore: no se pudo cargar DPAPI nativo (@primno/dpapi).",
    );
  }
  return {
    protect(plaintext, entropy) {
      return Buffer.from(Dpapi.protectData(plaintext, entropy, scope));
    },
    unprotect(ciphertext, entropy) {
      return Buffer.from(Dpapi.unprotectData(ciphertext, entropy, scope));
    },
  };
}

/**
 * Test-only seal (AES-256-GCM with provided key). Not for production Windows.
 * Allows persistence tests on non-Windows CI without changing Ed25519.
 */
export function createTestSealProvider(secret: Buffer): WindowsSealProvider {
  if (secret.length < 32) {
    throw new Error("test seal secret must be ≥32 bytes");
  }
  const key = secret.subarray(0, 32);
  return {
    protect(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]);
    },
    unprotect(ciphertext) {
      if (ciphertext.length < 28) {
        throw new Error("WindowsDeviceKeyStore: sealed blob inválido.");
      }
      const iv = ciphertext.subarray(0, 12);
      const tag = ciphertext.subarray(12, 28);
      const enc = ciphertext.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]);
    },
  };
}
