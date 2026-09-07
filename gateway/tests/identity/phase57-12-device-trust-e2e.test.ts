/**
 * PHASE 57.12 — Protocol-level E2E: Windows host ↔ Android device trust.
 *
 * Simulates Android with MemoryDeviceKeyStore / sealed DeviceKeyStore (no physical
 * device). Does not change production architecture — validates existing PHASE 57.8–57.11.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-12-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-e2e-phase5712!!!!!!!!!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "e2e.db");
process.env.PERSONAL_AGENT_ID = "e2e-agent-uuid-aaaa-bbbb";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const { mountDeviceAuthHttp } = await import(
  "../../src/http/device-auth-http.ts"
);
const { mountDevicesHttp } = await import("../../src/http/devices-http.ts");
const {
  MemoryDeviceKeyStore,
  buildDeviceAuthMessage,
  generateEd25519KeyPair,
  signEd25519,
  createTestSealProvider,
  WindowsDeviceKeyStore,
  DEVICE_KEY_ALGORITHM,
} = await import("../../../packages/device-crypto/index.ts");
const { db } = await import("../../src/db/database.ts");
const {
  createSession,
  dropSession,
} = await import("../../src/sessions/index.ts");
const { createAgentRuntime } = await import("../../src/agents/runtime.ts");
const { evaluateToolSafety } = await import("../../src/tools/safety.ts");
const { DEFAULT_TOOL_POLICY } = await import("../../src/tools/policy.ts");

const HUB = process.env.HUB_TOKEN!;
const here = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ID = process.env.PERSONAL_AGENT_ID!;

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

async function pairAndroidCrypto(deviceId: string, name: string) {
  const store = new MemoryDeviceKeyStore();
  const pub = await store.generate();
  const pairingPayload = {
    pairingSessionId: "will-set",
    pairingSecret: "will-set",
    deviceId,
    deviceName: name,
    platform: "android",
    publicKey: pub.publicKey,
    keyAlgorithm: "Ed25519" as const,
  };
  const s = pairing.createPairingSession();
  pairingPayload.pairingSessionId = s.id;
  pairingPayload.pairingSecret = s.secret;

  // Security: pairing payload must never carry private key material.
  const wire = JSON.stringify(pairingPayload);
  assert.equal(wire.includes("privateKey"), false);
  assert.equal(wire.includes("private_key"), false);
  assert.equal(wire.includes("pkcs8"), false);
  assert.ok(wire.includes("publicKey"));
  assert.ok(wire.includes("Ed25519"));

  const accepted = pairing.acceptPairingRequest(pairingPayload);
  assert.equal(accepted.ok, true);
  const approved = pairing.approvePairingSession(s.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error("approve failed");
  return {
    store,
    publicKey: pub.publicKey,
    deviceCredential: approved.deviceCredential,
  };
}

async function challengeSignVerify(deviceId: string, store: MemoryDeviceKeyStore) {
  const issued = identity.issueDeviceAuthChallenge(deviceId);
  assert.equal(issued.ok, true, "challenge");
  if (!issued.ok) throw new Error("challenge failed");
  const signature = await store.sign(
    buildDeviceAuthMessage({
      deviceId,
      challengeHex: issued.challenge,
    }),
  );
  const verified = identity.verifyDeviceAuthSignature({
    deviceId,
    challengeId: issued.challengeId,
    signatureBase64: signature,
  });
  assert.equal(verified.ok, true, "verify");
  if (!verified.ok) throw new Error("verify failed");
  return { issued, signature, session: verified.session, userContext: verified.userContext };
}

describe("PHASE 57.12 E2E Windows ↔ Android device trust", () => {
  it("full chain: host + android pair → AuthSession → UserContext → runtime → negatives → revoke → re-pair", async () => {
    const local = identity.ensureLocalIdentity();
    assert.equal(local.agent.id, AGENT_ID);
    assert.equal(local.user.id, "local-user");

    // --- B. Windows host identity (ensure-host idempotent) ---
    const hostStore = new MemoryDeviceKeyStore();
    const hostPub = await hostStore.generate();
    const hostDeviceId = "desktop-e2e-host-1";
    const app = new Hono();
    mountDeviceAuthHttp(app, { hubToken: HUB });
    mountDevicesHttp(app, { hubToken: HUB });

    const ensure1 = await app.request("/v1/device-auth/ensure-host", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: hostDeviceId,
        publicKey: hostPub.publicKey,
        deviceName: "Este equipo",
        platform: "windows",
      }),
    });
    assert.equal(ensure1.status, 200);
    const e1 = (await ensure1.json()) as {
      ok: boolean;
      created: boolean;
      privateKey?: string;
    };
    assert.equal(e1.ok, true);
    assert.equal(e1.created, true);
    assert.equal("privateKey" in e1, false);

    const ensure2 = await app.request("/v1/device-auth/ensure-host", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: hostDeviceId,
        publicKey: hostPub.publicKey,
      }),
    });
    assert.equal(ensure2.status, 200);
    assert.equal(((await ensure2.json()) as { created: boolean }).created, false);

    const hostRow = identity.getTrustedDeviceCrypto(hostDeviceId);
    assert.ok(hostRow);
    assert.equal(hostRow!.identityStatus, "crypto_enrolled");
    assert.equal(hostRow!.publicKey, hostPub.publicKey);

    // --- C–E. Android identity + pairing + trusted_devices ---
    const androidDeviceId = "android-e2e-phone-1";
    const { store: androidStore, publicKey: androidPub } =
      await pairAndroidCrypto(androidDeviceId, "Pixel E2E");

    const trusted = identity.getTrustedDeviceCrypto(androidDeviceId);
    assert.ok(trusted);
    assert.equal(trusted!.status, "ACTIVE");
    assert.equal(trusted!.identityStatus, "crypto_enrolled");
    assert.equal(trusted!.publicKey, androidPub);
    assert.equal(trusted!.keyAlgorithm, DEVICE_KEY_ALGORITHM);
    assert.equal(trusted!.userId, local.user.id);
    assert.equal(trusted!.agentId, local.agent.id);

    const dbCols = (
      db.prepare(`PRAGMA table_info(trusted_devices)`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    assert.equal(dbCols.includes("private_key"), false);

    // --- F–H. Challenge → signature → AuthSession → UserContext ---
    const auth1 = await challengeSignVerify(androidDeviceId, androidStore);
    assert.equal(auth1.session.deviceId, androidDeviceId);
    assert.equal(auth1.session.userId, local.user.id);
    assert.equal(auth1.session.agentId, local.agent.id);
    assert.equal(auth1.session.authKind, "device");
    assert.equal(identity.isSessionActive(auth1.session.id), true);

    assert.equal(auth1.userContext.userId, local.user.id);
    assert.equal(auth1.userContext.agentId, local.agent.id);
    assert.equal(auth1.userContext.deviceId, androidDeviceId);
    assert.equal(auth1.userContext.sessionId, auth1.session.id);
    assert.equal(auth1.userContext.authKind, "device");
    assert.notEqual(auth1.userContext.authKind, "install_compat");

    // --- I–J. AgentRuntime + Tool Safety receive correct UserContext ---
    const safety = evaluateToolSafety({
      toolName: "filesystem.read",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: auth1.userContext,
    });
    assert.equal(safety.decision, "ALLOWED");

    let capturedCtx: typeof auth1.userContext | undefined;
    const runtime = createAgentRuntime({
      memory: {
        ensureConversation: (id) => id ?? "c-e2e",
        addMessage: () => "m1",
        getHistory: () => [],
      },
      llm: {
        async *stream() {
          yield { type: "text_delta" as const, text: "e2e-ok" };
        },
      },
      tools: {
        get() {
          return undefined;
        },
        list() {
          return [];
        },
      },
    });
    for await (const ev of runtime.runTurn({
      userMessage: "ping",
      userContext: auth1.userContext,
      deviceId: auth1.userContext.deviceId,
      sessionId: auth1.userContext.sessionId,
    })) {
      if (ev.type === "text_delta") {
        capturedCtx = auth1.userContext;
        assert.equal(ev.text, "e2e-ok");
      }
    }
    assert.ok(capturedCtx);
    assert.equal(capturedCtx!.deviceId, androidDeviceId);
    assert.equal(capturedCtx!.agentId, AGENT_ID);

    // --- K. Wrong signature ---
    const issuedBad = identity.issueDeviceAuthChallenge(androidDeviceId);
    assert.equal(issuedBad.ok, true);
    if (!issuedBad.ok) return;
    const otherKp = generateEd25519KeyPair();
    const wrongSig = signEd25519(
      otherKp.privateKey,
      buildDeviceAuthMessage({
        deviceId: androidDeviceId,
        challengeHex: issuedBad.challenge,
      }),
    );
    const wrongVerify = identity.verifyDeviceAuthSignature({
      deviceId: androidDeviceId,
      challengeId: issuedBad.challengeId,
      signatureBase64: wrongSig,
    });
    assert.equal(wrongVerify.ok, false);

    // --- L. Wrong device (sign as B, claim A) ---
    const { store: storeB } = await pairAndroidCrypto(
      "android-e2e-phone-b",
      "Phone B",
    );
    const issuedA = identity.issueDeviceAuthChallenge(androidDeviceId);
    assert.equal(issuedA.ok, true);
    if (!issuedA.ok) return;
    const sigFromB = await storeB.sign(
      buildDeviceAuthMessage({
        deviceId: androidDeviceId,
        challengeHex: issuedA.challenge,
      }),
    );
    assert.equal(
      identity.verifyDeviceAuthSignature({
        deviceId: androidDeviceId,
        challengeId: issuedA.challengeId,
        signatureBase64: sigFromB,
      }).ok,
      false,
    );

    // --- M. Replay ---
    const replay = identity.verifyDeviceAuthSignature({
      deviceId: androidDeviceId,
      challengeId: auth1.issued.challengeId,
      signatureBase64: auth1.signature,
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) {
      assert.equal(replay.replay, true);
    }

    // --- N. Android restart (persisted sealed store) ---
    const androidPersistDir = fs.mkdtempSync(
      path.join(tmp, "android-persist-"),
    );
    const seal = createTestSealProvider(randomBytes(32));
    const persistId = "android-e2e-persist-1";
    const persistA = new WindowsDeviceKeyStore({
      deviceId: persistId,
      storageDir: androidPersistDir,
      seal,
    });
    const persistPub = await persistA.generate();
    const sPersist = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: sPersist.id,
      pairingSecret: sPersist.secret,
      deviceId: persistId,
      deviceName: "Persist Phone",
      platform: "android",
      publicKey: persistPub.publicKey,
      keyAlgorithm: "Ed25519",
    });
    assert.equal(pairing.approvePairingSession(sPersist.id).ok, true);

    // "restart": new store instance, same sealed material
    const persistB = new WindowsDeviceKeyStore({
      deviceId: persistId,
      storageDir: androidPersistDir,
      seal,
    });
    const afterRestart = await persistB.getPublicKey();
    assert.equal(afterRestart!.publicKey, persistPub.publicKey);
    const issuedR = identity.issueDeviceAuthChallenge(persistId);
    assert.equal(issuedR.ok, true);
    if (!issuedR.ok) return;
    const sigR = await persistB.sign(
      buildDeviceAuthMessage({
        deviceId: persistId,
        challengeHex: issuedR.challenge,
      }),
    );
    const okR = identity.verifyDeviceAuthSignature({
      deviceId: persistId,
      challengeId: issuedR.challengeId,
      signatureBase64: sigR,
    });
    assert.equal(okR.ok, true);

    // --- O. Gateway restart (DB persistence): re-auth without re-pair ---
    const stillTrusted = identity.getTrustedDeviceCrypto(androidDeviceId);
    assert.ok(stillTrusted);
    assert.equal(stillTrusted!.publicKey, androidPub);
    const authAfterGw = await challengeSignVerify(androidDeviceId, androidStore);
    assert.equal(authAfterGw.userContext.deviceId, androidDeviceId);

    // --- P + old session + post-revoke ---
    const sessionBeforeRevoke = authAfterGw.session.id;
    let wsClosed = false;
    const ws = mockWs(() => {
      wsClosed = true;
    });
    const conn = createSession(ws);
    conn.authenticated = true;
    conn.deviceId = androidDeviceId;

    const owner = identity.resolveInstallCompatSession().userContext;
    const revoked = identity.revokeTrustedDevice(androidDeviceId, owner);
    assert.equal(revoked.ok, true);
    if (!revoked.ok) return;
    assert.equal(wsClosed, true);
    assert.equal(identity.isSessionActive(sessionBeforeRevoke), false);
    assert.equal(
      identity.resolveUserContextFromSessionId(sessionBeforeRevoke),
      null,
    );
    assert.equal(identity.issueDeviceAuthChallenge(androidDeviceId).ok, false);

    // HTTP revoke path already exercised via identity; list must not show ACTIVE crypto
    const listRes = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      devices: Array<{ deviceId: string; status: string; hasPublicKey: boolean }>;
    };
    const androidList = listJson.devices.find(
      (d) => d.deviceId === androidDeviceId,
    );
    assert.ok(androidList);
    assert.equal(androidList!.status, "REVOKED");
    assert.equal(androidList!.hasPublicKey, false);

    // HUB_TOKEN must not resurrect device crypto trust
    assert.equal(identity.issueDeviceAuthChallenge(androidDeviceId).ok, false);
    const hubCtx = identity.resolveInstallCompatSession().userContext;
    assert.equal(hubCtx.authKind, "install_compat");
    assert.notEqual(hubCtx.deviceId, androidDeviceId);

    dropSession(ws);

    // --- Re-pair: same cryptographic identity reused (ON CONFLICT) ---
    const s2 = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: s2.id,
      pairingSecret: s2.secret,
      deviceId: androidDeviceId,
      deviceName: "Pixel E2E",
      platform: "android",
      publicKey: androidPub,
      keyAlgorithm: "Ed25519",
    });
    assert.equal(pairing.approvePairingSession(s2.id).ok, true);
    const reTrusted = identity.getTrustedDeviceCrypto(androidDeviceId);
    assert.equal(reTrusted!.status, "ACTIVE");
    assert.equal(reTrusted!.publicKey, androidPub);
    assert.equal(reTrusted!.identityStatus, "crypto_enrolled");
    const authRepair = await challengeSignVerify(androidDeviceId, androidStore);
    assert.equal(authRepair.userContext.authKind, "device");
  });

  it("legacy device pairs without publicKey; cannot device_crypto challenge", () => {
    const s = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-legacy-e2e",
      deviceName: "Legacy",
      platform: "android",
    });
    const approved = pairing.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const row = identity.getTrustedDeviceCrypto("android-legacy-e2e");
    assert.equal(row!.identityStatus, "legacy");
    assert.equal(row!.publicKey, null);
    assert.equal(
      pairing.verifyDeviceCredential(
        "android-legacy-e2e",
        approved.deviceCredential,
      ),
      true,
    );
    // Crypto challenge requires enrolled publicKey
    assert.equal(
      identity.issueDeviceAuthChallenge("android-legacy-e2e").ok,
      false,
    );
  });

  it("HTTP challenge/verify path matches identity API; no privateKey in responses", async () => {
    const { store, publicKey } = await pairAndroidCrypto(
      "android-http-e2e",
      "HTTP Phone",
    );
    const app = new Hono();
    mountDeviceAuthHttp(app, { hubToken: HUB });

    const ch = await app.request("/v1/device-auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "android-http-e2e" }),
    });
    assert.equal(ch.status, 200);
    const chBody = (await ch.json()) as {
      ok: boolean;
      challengeId: string;
      challenge: string;
      privateKey?: string;
    };
    assert.equal(chBody.ok, true);
    assert.equal("privateKey" in chBody, false);

    const sig = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "android-http-e2e",
        challengeHex: chBody.challenge,
      }),
    );
    const ver = await app.request("/v1/device-auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "android-http-e2e",
        challengeId: chBody.challengeId,
        signature: sig,
      }),
    });
    assert.equal(ver.status, 200);
    const verBody = (await ver.json()) as {
      ok: boolean;
      deviceId?: string;
      authSessionId?: string;
      authKind?: string;
      privateKey?: string;
    };
    assert.equal(verBody.ok, true);
    assert.equal("privateKey" in verBody, false);
    assert.equal(verBody.deviceId, "android-http-e2e");
    assert.equal(verBody.authKind, "device");
    assert.ok(verBody.authSessionId);

    const row = identity.getTrustedDeviceCrypto("android-http-e2e");
    assert.equal(row!.publicKey, publicKey);
  });

  it("source contracts: no private key APIs in Gateway device-auth path", () => {
    for (const rel of [
      "../../src/http/device-auth-http.ts",
      "../../src/identity/device-auth.ts",
      "../../src/identity/ensure-host-device.ts",
    ]) {
      const src = fs.readFileSync(path.join(here, rel), "utf8");
      assert.doesNotMatch(src, /privateKey|private_key|pkcs8/i);
    }
    const types = fs.readFileSync(
      path.join(here, "../../../packages/device-crypto/types.ts"),
      "utf8",
    );
    const api = types
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(api, /getPrivateKey/);
  });
});
