/**
 * PHASE 57.9 — WindowsDeviceKeyStore (DPAPI-backed Ed25519 persistence).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";

const {
  WindowsDeviceKeyStore,
  createDeviceKeyStore,
  createTestSealProvider,
  buildDeviceAuthMessage,
  verifyEd25519,
  MemoryDeviceKeyStore,
} = await import("../../../packages/device-crypto/index.ts");

const here = path.dirname(fileURLToPath(import.meta.url));

describe("PHASE 57.9 Windows DeviceKeyStore", () => {
  it("API never exposes getPrivateKey / exportPrivateKey", () => {
    const src = fs
      .readFileSync(
        path.join(here, "../../../packages/device-crypto/windows-keystore.ts"),
        "utf8",
      )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /getPrivateKey|exportPrivateKey|getKeyMaterial/);
    const store = new WindowsDeviceKeyStore({
      deviceId: "api-check",
      storageDir: fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-api-")),
      seal: createTestSealProvider(randomBytes(32)),
    });
    assert.equal(
      typeof (store as unknown as { getPrivateKey?: unknown }).getPrivateKey,
      "undefined",
    );
  });

  it("persist across recreate: same publicKey; sign verifies", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-persist-"));
    const seal = createTestSealProvider(randomBytes(32));
    const deviceId = "desktop-device-persist";

    const a = new WindowsDeviceKeyStore({ deviceId, storageDir: dir, seal });
    const idA = await a.generate();
    const sig = await a.sign(
      buildDeviceAuthMessage({
        deviceId,
        challengeHex: "ab".repeat(32),
      }),
    );

    const b = new WindowsDeviceKeyStore({ deviceId, storageDir: dir, seal });
    const idB = await b.getPublicKey();
    assert.ok(idB);
    assert.equal(idB!.publicKey, idA.publicKey);
    assert.equal(idB!.keyAlgorithm, "Ed25519");

    assert.equal(
      verifyEd25519({
        publicKeySpkiBase64: idB!.publicKey,
        payload: buildDeviceAuthMessage({
          deviceId,
          challengeHex: "ab".repeat(32),
        }),
        signatureBase64: sig,
      }),
      true,
    );

    // meta.json must not contain private key material
    const meta = JSON.parse(
      fs.readFileSync(path.join(dir, "meta.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal("privateKey" in meta, false);
    assert.equal("pkcs8" in meta, false);
    assert.ok(fs.existsSync(path.join(dir, "sealed.dpapi")));
  });

  it("distinct deviceIds get distinct keys", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-multi-"));
    const seal = createTestSealProvider(randomBytes(32));
    const a = new WindowsDeviceKeyStore({
      deviceId: "dev-a",
      storageDir: path.join(root, "a"),
      seal,
    });
    const b = new WindowsDeviceKeyStore({
      deviceId: "dev-b",
      storageDir: path.join(root, "b"),
      seal,
    });
    const ia = await a.generate();
    const ib = await b.generate();
    assert.notEqual(ia.publicKey, ib.publicKey);
  });

  it("delete then generate yields new identity", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-del-"));
    const seal = createTestSealProvider(randomBytes(32));
    const store = new WindowsDeviceKeyStore({
      deviceId: "dev-del",
      storageDir: dir,
      seal,
    });
    const first = await store.generate();
    await store.delete();
    assert.equal(await store.getPublicKey(), null);
    const second = await store.generate();
    assert.notEqual(second.publicKey, first.publicKey);
  });

  it("corrupt seal does not silently regenerate", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-corrupt-"));
    const seal = createTestSealProvider(randomBytes(32));
    const store = new WindowsDeviceKeyStore({
      deviceId: "dev-bad",
      storageDir: dir,
      seal,
    });
    await store.generate();
    fs.writeFileSync(path.join(dir, "sealed.dpapi"), Buffer.from("garbage"));
    await assert.rejects(
      () =>
        store.sign(
          buildDeviceAuthMessage({
            deviceId: "dev-bad",
            challengeHex: "cd".repeat(32),
          }),
        ),
      /no se pudo abrir|DPAPI|sellad/i,
    );
    const pub = await store.getPublicKey();
    assert.ok(pub, "meta pública intacta; no se destruye identidad");
  });

  it("factory: forceMemory → Memory; seal inject → WindowsDeviceKeyStore", () => {
    const mem = createDeviceKeyStore({
      deviceId: "x",
      forceMemory: true,
    });
    assert.ok(mem instanceof MemoryDeviceKeyStore);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-579-factory-"));
    const win = createDeviceKeyStore({
      deviceId: "y",
      storageDir: dir,
      seal: createTestSealProvider(randomBytes(32)),
    });
    assert.ok(win instanceof WindowsDeviceKeyStore);
  });

  it("docs record CNG Ed25519 limitation and DPAPI choice", () => {
    const doc = fs.readFileSync(
      path.join(
        here,
        "../../../docs/architecture/device-cryptographic-identity.md",
      ),
      "utf8",
    );
    assert.match(doc, /PHASE 57\.9|WindowsDeviceKeyStore|DPAPI/);
    assert.match(doc, /CNG.*Ed25519|Ed25519.*CNG|no soport/i);
  });
});
