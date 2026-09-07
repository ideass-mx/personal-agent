/**
 * Ed25519 verify / encode helpers (Node crypto).
 * Used by Gateway and by in-process DeviceKeyStore implementations.
 */
import {
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from "node:crypto";
import { DEVICE_KEY_ALGORITHM, type DevicePublicKeyIdentity } from "./types.ts";

/** Export public key as SPKI DER base64 (stable wire format). */
export function exportPublicKeySpkiBase64(publicKey: KeyObject): string {
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function importPublicKeySpkiBase64(spkiBase64: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(spkiBase64, "base64"),
    format: "der",
    type: "spki",
  });
}

export function generateEd25519KeyPair(): {
  publicKey: KeyObject;
  privateKey: KeyObject;
  identity: DevicePublicKeyIdentity;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey,
    privateKey,
    identity: {
      publicKey: exportPublicKeySpkiBase64(publicKey),
      keyAlgorithm: DEVICE_KEY_ALGORITHM,
    },
  };
}

export function signEd25519(
  privateKey: KeyObject,
  payload: Uint8Array,
): string {
  const sig = nodeSign(null, Buffer.from(payload), privateKey);
  return sig.toString("base64");
}

export function verifyEd25519(input: {
  publicKeySpkiBase64: string;
  payload: Uint8Array;
  signatureBase64: string;
}): boolean {
  try {
    const key = importPublicKeySpkiBase64(input.publicKeySpkiBase64);
    const sig = Buffer.from(input.signatureBase64, "base64");
    if (sig.length === 0) return false;
    return nodeVerify(null, Buffer.from(input.payload), key, sig);
  } catch {
    return false;
  }
}

export function isLikelyEd25519SpkiBase64(value: string): boolean {
  try {
    const key = importPublicKeySpkiBase64(value);
    return key.asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}
