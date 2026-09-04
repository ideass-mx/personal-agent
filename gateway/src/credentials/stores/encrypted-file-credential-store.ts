/**
 * EncryptedFileCredentialStore — fallback / Linux / tests.
 * AES-256-GCM; master key en archivo dedicado (no .env / SQLite / product.json).
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import path from "node:path";
import type { SecretStore } from "../types.ts";
import { assertSafeCredentialId } from "../types.ts";

const MASTER_FILE = ".master.key";
const ALGO = "aes-256-gcm";

export type EncryptedFileCredentialStoreOptions = {
  readonly rootDir: string;
};

export class EncryptedFileCredentialStore implements SecretStore {
  private readonly rootDir: string;
  private masterKey: Buffer | null = null;

  constructor(options: EncryptedFileCredentialStoreOptions) {
    this.rootDir = path.resolve(options.rootDir);
    mkdirSync(this.rootDir, { recursive: true });
  }

  private masterPath(): string {
    return path.join(this.rootDir, MASTER_FILE);
  }

  private secretPath(id: string): string {
    return path.join(this.rootDir, `${id}.secret`);
  }

  private loadOrCreateMaster(): Buffer {
    if (this.masterKey) return this.masterKey;
    const mp = this.masterPath();
    if (existsSync(mp)) {
      const key = readFileSync(mp);
      if (key.byteLength !== 32) {
        throw new Error("EncryptedFileCredentialStore: master key inválida");
      }
      this.masterKey = key;
      return key;
    }
    const key = randomBytes(32);
    writeFileSync(mp, key, { mode: 0o600 });
    try {
      chmodSync(mp, 0o600);
    } catch {
      /* Windows may ignore */
    }
    this.masterKey = key;
    return key;
  }

  async put(credentialId: string, secret: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("SecretStore.put: secret vacío");
    }
    const key = this.loadOrCreateMaster();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, enc]);
    const dest = this.secretPath(id);
    writeFileSync(dest, payload, { mode: 0o600 });
    try {
      chmodSync(dest, 0o600);
    } catch {
      /* ignore */
    }
  }

  async get(credentialId: string): Promise<string | null> {
    const id = assertSafeCredentialId(credentialId);
    const dest = this.secretPath(id);
    if (!existsSync(dest)) return null;
    const key = this.loadOrCreateMaster();
    const payload = readFileSync(dest);
    if (payload.byteLength < 28) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const data = payload.subarray(28);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf8");
  }

  async delete(credentialId: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    const dest = this.secretPath(id);
    if (existsSync(dest)) {
      unlinkSync(dest);
    }
  }
}
