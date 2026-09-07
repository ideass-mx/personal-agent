/**
 * Select DeviceKeyStore implementation.
 * Windows → WindowsDeviceKeyStore (DPAPI-backed Ed25519).
 * Tests / other OS → MemoryDeviceKeyStore unless overridden.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDeviceKeyStore } from "./memory-keystore.ts";
import type { DeviceKeyStore } from "./types.ts";
import {
  WindowsDeviceKeyStore,
  windowsDeviceIdentityDir,
} from "./windows-keystore.ts";
import type { WindowsSealProvider } from "./windows-seal.ts";

export type CreateDeviceKeyStoreOptions = {
  deviceId: string;
  /** Force in-memory store (unit tests). */
  forceMemory?: boolean;
  /** Override product data root (defaults LOCALAPPDATA/…/PersonalAgent). */
  productDataRoot?: string;
  /** Inject seal (tests on any OS). */
  seal?: WindowsSealProvider;
  /** Explicit storage dir (skips productDataRoot/device-identity layout). */
  storageDir?: string;
};

function defaultProductDataRoot(): string {
  if (process.env.PERSONAL_AGENT_DATA_DIR?.trim()) {
    return process.env.PERSONAL_AGENT_DATA_DIR.trim();
  }
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA?.trim() ||
      path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "Ideass", "PersonalAgent");
  }
  const base =
    process.env.XDG_DATA_HOME?.trim() ||
    path.join(os.homedir(), ".local", "share");
  return path.join(base, "Ideass", "PersonalAgent");
}

/**
 * @deprecated Prefer createDeviceKeyStore. Kept for PHASE 57.8 call sites.
 */
export type NodeDeviceKeyStoreOptions = {
  backend?: "memory" | "windows";
  deviceId?: string;
  forceMemory?: boolean;
  productDataRoot?: string;
  seal?: WindowsSealProvider;
  storageDir?: string;
};

export function createNodeDeviceKeyStore(
  opts?: NodeDeviceKeyStoreOptions,
): DeviceKeyStore {
  if (!opts?.deviceId || opts.forceMemory || opts.backend === "memory") {
    return new MemoryDeviceKeyStore();
  }
  return createDeviceKeyStore({
    deviceId: opts.deviceId,
    forceMemory: opts.forceMemory,
    productDataRoot: opts.productDataRoot,
    seal: opts.seal,
    storageDir: opts.storageDir,
  });
}

export function createDeviceKeyStore(
  opts: CreateDeviceKeyStoreOptions,
): DeviceKeyStore {
  if (opts.forceMemory) {
    return new MemoryDeviceKeyStore();
  }

  // Production Windows path, or test path with injected seal.
  const wantWindowsStore =
    process.platform === "win32" || opts.seal != null;
  if (!wantWindowsStore) {
    return new MemoryDeviceKeyStore();
  }

  const storageDir =
    opts.storageDir ??
    windowsDeviceIdentityDir(
      opts.productDataRoot ?? defaultProductDataRoot(),
      opts.deviceId,
    );
  fs.mkdirSync(storageDir, { recursive: true });
  return new WindowsDeviceKeyStore({
    deviceId: opts.deviceId,
    storageDir,
    seal: opts.seal,
  });
}
