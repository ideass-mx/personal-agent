/**
 * PHASE 57.10 — Device enrollment via existing pairing + host ensure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-10-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-enrollment-phase5710!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "enroll.db");
process.env.PERSONAL_AGENT_ID = "enroll-agent-uuid-aaaa-bbbb";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const { mountDeviceAuthHttp } = await import(
  "../../src/http/device-auth-http.ts"
);
const {
  MemoryDeviceKeyStore,
  buildDeviceAuthMessage,
  generateEd25519KeyPair,
  signEd25519,
  createTestSealProvider,
  WindowsDeviceKeyStore,
} = await import("../../../packages/device-crypto/index.ts");
const { db } = await import("../../src/db/database.ts");
const {
  createSession,
  dropSession,
} = await import("../../src/sessions/index.ts");
const { randomBytes } = await import("node:crypto");

const HUB = process.env.HUB_TOKEN!;
const here = path.dirname(fileURLToPath(import.meta.url));

function mockWs(onClose?: () => void): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send() {},
    close() {
      onClose?.();
    },
  } as unknown as WebSocket;
}

describe("PHASE 57.10 Device enrollment & pairing", () => {
  it("pairing with publicKey → crypto_enrolled trusted device", async () => {
    identity.ensureLocalIdentity();
    const store = new MemoryDeviceKeyStore();
    const pub = await store.generate();
    const s = pairing.createPairingSession();
    assert.equal(
      pairing.acceptPairingRequest({
        pairingSessionId: s.id,
        pairingSecret: s.secret,
        deviceId: "phone-enroll-1",
        deviceName: "Phone",
        platform: "android",
        publicKey: pub.publicKey,
        keyAlgorithm: "Ed25519",
      }).ok,
      true,
    );
    const approved = pairing.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    const row = identity.getTrustedDeviceCrypto("phone-enroll-1");
    assert.ok(row);
    assert.equal(row!.identityStatus, "crypto_enrolled");
    assert.equal(row!.publicKey, pub.publicKey);

    const cols = (
      db.prepare(`PRAGMA table_info(trusted_devices)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    assert.equal(cols.includes("private_key"), false);
  });

  it("legacy pairing without publicKey still works", () => {
    const s = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "legacy-enroll",
      deviceName: "Legacy",
    });
    const approved = pairing.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.ok(approved.deviceCredential);
    const row = identity.getTrustedDeviceCrypto("legacy-enroll");
    assert.equal(row!.identityStatus, "legacy");
    assert.equal(row!.publicKey, null);
    assert.equal(
      pairing.verifyDeviceCredential("legacy-enroll", approved.deviceCredential),
      true,
    );
  });

  it("after enrollment: challenge → sign → verify AuthSession", async () => {
    const store = new MemoryDeviceKeyStore();
    const pub = await store.generate();
    const s = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "phone-sign",
      publicKey: pub.publicKey,
      keyAlgorithm: "Ed25519",
    });
    assert.equal(pairing.approvePairingSession(s.id).ok, true);

    const issued = identity.issueDeviceAuthChallenge("phone-sign");
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const sig = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "phone-sign",
        challengeHex: issued.challenge,
      }),
    );
    const verified = identity.verifyDeviceAuthSignature({
      deviceId: "phone-sign",
      challengeId: issued.challengeId,
      signatureBase64: sig,
    });
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    assert.equal(identity.isSessionActive(verified.session.id), true);

    // wrong key
    const issued2 = identity.issueDeviceAuthChallenge("phone-sign");
    assert.equal(issued2.ok, true);
    if (!issued2.ok) return;
    const other = generateEd25519KeyPair();
    const bad = signEd25519(
      other.privateKey,
      buildDeviceAuthMessage({
        deviceId: "phone-sign",
        challengeHex: issued2.challenge,
      }),
    );
    assert.equal(
      identity.verifyDeviceAuthSignature({
        deviceId: "phone-sign",
        challengeId: issued2.challengeId,
        signatureBase64: bad,
      }).ok,
      false,
    );
  });

  it("replay challenge rejected; revoke rejects valid key", async () => {
    const store = new MemoryDeviceKeyStore();
    const pub = await store.generate();
    const s = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "phone-rev",
      publicKey: pub.publicKey,
      keyAlgorithm: "Ed25519",
    });
    pairing.approvePairingSession(s.id);

    const issued = identity.issueDeviceAuthChallenge("phone-rev");
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const payload = buildDeviceAuthMessage({
      deviceId: "phone-rev",
      challengeHex: issued.challenge,
    });
    const sig = await store.sign(payload);
    assert.equal(
      identity.verifyDeviceAuthSignature({
        deviceId: "phone-rev",
        challengeId: issued.challengeId,
        signatureBase64: sig,
      }).ok,
      true,
    );
    const replay = identity.verifyDeviceAuthSignature({
      deviceId: "phone-rev",
      challengeId: issued.challengeId,
      signatureBase64: sig,
    });
    assert.equal(replay.ok, false);

    let closed = false;
    const ws = mockWs(() => {
      closed = true;
    });
    const conn = createSession(ws);
    conn.authenticated = true;
    conn.deviceId = "phone-rev";
    const owner = identity.resolveInstallCompatSession().userContext;
    identity.revokeTrustedDevice("phone-rev", owner);
    assert.equal(closed, true);
    assert.equal(identity.issueDeviceAuthChallenge("phone-rev").ok, false);
    dropSession(ws);
  });

  it("ensure-host is OWNER_LOCAL idempotent; no private key in HTTP", async () => {
    const store = new MemoryDeviceKeyStore();
    const pub = await store.generate();
    const app = new Hono();
    mountDeviceAuthHttp(app, { hubToken: HUB });

    const first = await app.request("/v1/device-auth/ensure-host", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: "desktop-host-1",
        publicKey: pub.publicKey,
        deviceName: "Este equipo",
        platform: "windows",
      }),
    });
    assert.equal(first.status, 200);
    const j1 = (await first.json()) as {
      ok: boolean;
      created: boolean;
      publicKey?: string;
      privateKey?: string;
    };
    assert.equal(j1.ok, true);
    assert.equal(j1.created, true);
    assert.equal("privateKey" in j1, false);
    assert.equal("publicKey" in j1, false);

    const second = await app.request("/v1/device-auth/ensure-host", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: "desktop-host-1",
        publicKey: pub.publicKey,
      }),
    });
    assert.equal(second.status, 200);
    const j2 = (await second.json()) as { created: boolean };
    assert.equal(j2.created, false);

    const anon = await app.request("/v1/device-auth/ensure-host", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "desktop-host-1",
        publicKey: pub.publicKey,
      }),
    });
    assert.equal(anon.status, 401);
  });

  it("Desktop DeviceKeyStore persistence (seal) keeps same publicKey", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-5710-desk-"));
    const seal = createTestSealProvider(randomBytes(32));
    const deviceId = "desktop-persist-a";
    const a = new WindowsDeviceKeyStore({ deviceId, storageDir: dir, seal });
    const first = await a.generate();
    const b = new WindowsDeviceKeyStore({ deviceId, storageDir: dir, seal });
    const second = await b.getPublicKey();
    assert.equal(second!.publicKey, first.publicKey);
    const meta = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
    assert.doesNotMatch(meta, /private|pkcs8|BEGIN/i);
  });

  it("no private key leakage in enrollment sources", () => {
    for (const rel of [
      "../../src/http/device-auth-http.ts",
      "../../src/identity/ensure-host-device.ts",
      "../../src/ws/index.ts",
    ]) {
      const src = fs.readFileSync(path.join(here, rel), "utf8");
      assert.doesNotMatch(src, /privateKey|private_key|pkcs8/i);
    }
  });
});
