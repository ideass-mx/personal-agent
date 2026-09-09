/**
 * Resolve host DeviceKeyStore for Cloud Auth (reuses PHASE 57.x identity).
 * Private key never leaves the store.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  createDeviceKeyStore,
  createTestSealProvider,
  WindowsDeviceKeyStore,
  windowsDeviceIdentityDir,
  type DeviceKeyStore,
} from "../../../../packages/device-crypto/index.ts";
import { resolveProductDataRoot } from "../../local-llm/storage.ts";

const DEVICE_ID_RE = /^[0-9a-z][0-9a-z._-]{1,127}$/i;

function secretsPath(root = resolveProductDataRoot()): string {
  return path.join(root, "config", "secrets.json");
}

export function readOrCreateHostDeviceId(root = resolveProductDataRoot()): string {
  const fromEnv = process.env.PERSONAL_AGENT_DEVICE_ID?.trim();
  if (fromEnv && DEVICE_ID_RE.test(fromEnv)) return fromEnv;

  const file = secretsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  if (typeof raw.deviceId === "string" && DEVICE_ID_RE.test(raw.deviceId.trim())) {
    return raw.deviceId.trim();
  }
  const deviceId = `desktop-${randomUUID()}`;
  raw.deviceId = deviceId;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2), { encoding: "utf8", mode: 0o600 });
  return deviceId;
}

/**
 * Open host DeviceKeyStore (same layout as Desktop / ensure-host-cli).
 * Non-Windows uses the same AES-GCM test seal as Desktop when not on win32.
 */
export async function openHostDeviceKeyStore(input?: {
  deviceId?: string;
  productDataRoot?: string;
  forceMemory?: boolean;
}): Promise<{ deviceId: string; store: DeviceKeyStore }> {
  const productDataRoot = input?.productDataRoot ?? resolveProductDataRoot();
  const deviceId = input?.deviceId ?? readOrCreateHostDeviceId(productDataRoot);

  if (input?.forceMemory) {
    const store = createDeviceKeyStore({ deviceId, forceMemory: true });
    return { deviceId, store };
  }

  const forceDevSeal =
    process.env.PA_DEVICE_KEYSTORE_MEMORY === "1" ||
    process.platform !== "win32";

  const store = forceDevSeal
    ? new WindowsDeviceKeyStore({
        deviceId,
        storageDir: windowsDeviceIdentityDir(productDataRoot, deviceId),
        seal: createTestSealProvider(
          createHash("sha256").update(`PA-DEV-SEAL:${deviceId}`).digest(),
        ),
      })
    : createDeviceKeyStore({ deviceId, productDataRoot });

  return { deviceId, store };
}

export function shortDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId, "utf8").digest("hex").slice(0, 12);
}
