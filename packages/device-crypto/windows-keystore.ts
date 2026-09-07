/**
 * PHASE 57.9 — WindowsDeviceKeyStore
 *
 * Ed25519 identity (PHASE 57.8) + Windows DPAPI for private key at rest.
 *
 * Why not CNG KSP?
 * Microsoft Software / Platform Crypto Providers do not support Ed25519/EdDSA
 * signing. Curve25519 in CNG is ECDH-oriented, not EdDSA. Changing the product
 * algorithm to ECDSA/RSA would break PHASE 57.8 — not done here.
 *
 * Protection model:
 *   private PKCS8 DER → DPAPI CryptProtectData (CurrentUser) → sealed.dpapi
 *   public SPKI + deviceId → meta.json (non-secret)
 *   sign() → unprotect in memory → Node Ed25519 sign → discard key handle
 *
 * Never exposes getPrivateKey / exportPrivateKey.
 */
import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  exportPublicKeySpkiBase64,
  generateEd25519KeyPair,
  signEd25519,
} from "./ed25519.ts";
import { DEVICE_KEY_ALGORITHM, type DeviceKeyStore, type DevicePublicKeyIdentity } from "./types.ts";
import {
  loadWindowsDpapiSeal,
  type WindowsSealProvider,
} from "./windows-seal.ts";

const META_FILE = "meta.json";
const SEALED_FILE = "sealed.dpapi";
const KEY_NAMESPACE = "PersonalAgent.DeviceIdentity";

export type WindowsDeviceKeyStoreOptions = {
  /** Product deviceId (not Windows USERNAME/SID/hostname). */
  deviceId: string;
  /** Directory for meta.json + sealed.dpapi (ciphertext only). */
  storageDir: string;
  /**
   * Inject seal provider (tests). Production Windows loads DPAPI automatically.
   */
  seal?: WindowsSealProvider;
};

type MetaFile = {
  version: 1;
  namespace: typeof KEY_NAMESPACE;
  deviceId: string;
  publicKey: string;
  keyAlgorithm: typeof DEVICE_KEY_ALGORITHM;
};

function safeError(message: string): Error {
  // Never append Windows / crypto exception payloads (may contain secrets).
  return new Error(message);
}

function entropyFor(deviceId: string): Buffer {
  return Buffer.from(`${KEY_NAMESPACE}\n${deviceId}`, "utf8");
}

function readMeta(dir: string): MetaFile | null {
  const p = path.join(dir, META_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as MetaFile;
    if (
      raw?.version !== 1 ||
      raw.namespace !== KEY_NAMESPACE ||
      typeof raw.deviceId !== "string" ||
      typeof raw.publicKey !== "string" ||
      raw.keyAlgorithm !== DEVICE_KEY_ALGORITHM
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeMeta(dir: string, meta: MetaFile): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify(meta), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function exportPkcs8Der(privateKey: KeyObject): Buffer {
  return privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
}

function importPkcs8Der(der: Buffer): KeyObject {
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

export class WindowsDeviceKeyStore implements DeviceKeyStore {
  private readonly deviceId: string;
  private readonly storageDir: string;
  private seal: WindowsSealProvider | null;
  private readonly injectSeal: WindowsSealProvider | undefined;

  constructor(opts: WindowsDeviceKeyStoreOptions) {
    if (!opts.deviceId?.trim()) {
      throw safeError("WindowsDeviceKeyStore: deviceId requerido.");
    }
    if (!opts.storageDir?.trim()) {
      throw safeError("WindowsDeviceKeyStore: storageDir requerido.");
    }
    this.deviceId = opts.deviceId.trim();
    this.storageDir = opts.storageDir;
    this.injectSeal = opts.seal;
    this.seal = opts.seal ?? null;
  }

  private async ensureSeal(): Promise<WindowsSealProvider> {
    if (this.seal) return this.seal;
    if (this.injectSeal) {
      this.seal = this.injectSeal;
      return this.seal;
    }
    this.seal = await loadWindowsDpapiSeal("CurrentUser");
    return this.seal;
  }

  async generate(): Promise<DevicePublicKeyIdentity> {
    const seal = await this.ensureSeal();
    const kp = generateEd25519KeyPair();
    const pkcs8 = exportPkcs8Der(kp.privateKey);
    try {
      const sealed = seal.protect(pkcs8, entropyFor(this.deviceId));
      fs.mkdirSync(this.storageDir, { recursive: true });
      fs.writeFileSync(path.join(this.storageDir, SEALED_FILE), sealed, {
        mode: 0o600,
      });
      writeMeta(this.storageDir, {
        version: 1,
        namespace: KEY_NAMESPACE,
        deviceId: this.deviceId,
        publicKey: kp.identity.publicKey,
        keyAlgorithm: DEVICE_KEY_ALGORITHM,
      });
      return kp.identity;
    } finally {
      pkcs8.fill(0);
    }
  }

  async getPublicKey(): Promise<DevicePublicKeyIdentity | null> {
    const meta = readMeta(this.storageDir);
    if (!meta) return null;
    if (meta.deviceId !== this.deviceId) {
      throw safeError(
        "WindowsDeviceKeyStore: meta deviceId no coincide; no se regenera en silencio.",
      );
    }
    if (!fs.existsSync(path.join(this.storageDir, SEALED_FILE))) {
      throw safeError(
        "WindowsDeviceKeyStore: falta blob sellado; identidad incompleta.",
      );
    }
    return {
      publicKey: meta.publicKey,
      keyAlgorithm: DEVICE_KEY_ALGORITHM,
    };
  }

  async sign(payload: Uint8Array): Promise<string> {
    const seal = await this.ensureSeal();
    const meta = readMeta(this.storageDir);
    if (!meta || meta.deviceId !== this.deviceId) {
      throw safeError("WindowsDeviceKeyStore: no hay identidad para firmar.");
    }
    const sealedPath = path.join(this.storageDir, SEALED_FILE);
    if (!fs.existsSync(sealedPath)) {
      throw safeError("WindowsDeviceKeyStore: no hay clave sellada.");
    }
    const sealed = fs.readFileSync(sealedPath);
    let pkcs8: Buffer;
    try {
      pkcs8 = seal.unprotect(sealed, entropyFor(this.deviceId));
    } catch {
      throw safeError(
        "WindowsDeviceKeyStore: no se pudo abrir la clave (DPAPI). No se regenera en silencio.",
      );
    }
    try {
      const privateKey = importPkcs8Der(pkcs8);
      const derived = exportPublicKeySpkiBase64(createPublicKey(privateKey));
      if (derived !== meta.publicKey) {
        throw safeError(
          "WindowsDeviceKeyStore: clave inconsistente con meta pública.",
        );
      }
      return signEd25519(privateKey, payload);
    } finally {
      pkcs8.fill(0);
    }
  }

  async delete(): Promise<void> {
    const sealed = path.join(this.storageDir, SEALED_FILE);
    const meta = path.join(this.storageDir, META_FILE);
    try {
      if (fs.existsSync(sealed)) fs.unlinkSync(sealed);
    } catch {
      throw safeError("WindowsDeviceKeyStore: no se pudo eliminar sealed blob.");
    }
    try {
      if (fs.existsSync(meta)) fs.unlinkSync(meta);
    } catch {
      throw safeError("WindowsDeviceKeyStore: no se pudo eliminar meta.");
    }
  }
}

/** Stable storage directory for a device under product data root. */
export function windowsDeviceIdentityDir(
  productDataRoot: string,
  deviceId: string,
): string {
  return path.join(productDataRoot, "device-identity", deviceId);
}
