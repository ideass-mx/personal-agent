/**
 * CLI: ensure host DeviceKeyStore identity (PHASE 57.10).
 * Prints JSON { ok, deviceId, publicKey, keyAlgorithm, created } — never private key.
 *
 * Usage:
 *   npx tsx packages/device-crypto/scripts/ensure-host-cli.ts <deviceId> <productDataRoot>
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  createDeviceKeyStore,
  createTestSealProvider,
  WindowsDeviceKeyStore,
  windowsDeviceIdentityDir,
} from "../index.ts";

async function main(): Promise<void> {
  const deviceId = process.argv[2]?.trim();
  const productDataRoot = process.argv[3]?.trim();
  if (!deviceId || !productDataRoot) {
    process.stderr.write(
      "usage: ensure-host-cli.ts <deviceId> <productDataRoot>\n",
    );
    process.exit(2);
  }
  try {
    fs.mkdirSync(productDataRoot, { recursive: true });
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

    let created = false;
    let pub = await store.getPublicKey();
    if (!pub) {
      pub = await store.generate();
      created = true;
    }
    process.stdout.write(
      JSON.stringify({
        ok: true,
        deviceId,
        publicKey: pub.publicKey,
        keyAlgorithm: pub.keyAlgorithm,
        created,
      }) + "\n",
    );
  } catch {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: "device_identity_unavailable",
      }) + "\n",
    );
    process.exit(1);
  }
}

await main();
