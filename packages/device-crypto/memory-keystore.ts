/**
 * In-memory DeviceKeyStore for tests and platforms without OS keyring yet.
 * Private key never leaves this object (no getPrivateKey API).
 */
import type { KeyObject } from "node:crypto";
import {
  generateEd25519KeyPair,
  signEd25519,
} from "./ed25519.ts";
import type { DeviceKeyStore, DevicePublicKeyIdentity } from "./types.ts";

export class MemoryDeviceKeyStore implements DeviceKeyStore {
  private privateKey: KeyObject | null = null;
  private identity: DevicePublicKeyIdentity | null = null;

  async generate(): Promise<DevicePublicKeyIdentity> {
    const kp = generateEd25519KeyPair();
    this.privateKey = kp.privateKey;
    this.identity = kp.identity;
    return kp.identity;
  }

  /** Test/bootstrap: load an already-generated pair without exposing private key. */
  loadGenerated(privateKey: KeyObject, identity: DevicePublicKeyIdentity): void {
    this.privateKey = privateKey;
    this.identity = identity;
  }

  async getPublicKey(): Promise<DevicePublicKeyIdentity | null> {
    return this.identity;
  }

  async sign(payload: Uint8Array): Promise<string> {
    if (!this.privateKey) {
      throw new Error("DeviceKeyStore: no key material");
    }
    return signEd25519(this.privateKey, payload);
  }

  async delete(): Promise<void> {
    this.privateKey = null;
    this.identity = null;
  }
}
