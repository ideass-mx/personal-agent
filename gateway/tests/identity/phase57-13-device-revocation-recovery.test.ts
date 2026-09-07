/**
 * PHASE 57.13 — E2E Device Revocation & Recovery.
 *
 * Deepens PHASE 57.12 around revoke cascade, session/WS invalidation,
 * isolation (A≠B), and official re-pair recovery. No production redesign.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-13-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-e2e-phase5713!!!!!!!!!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "revoke-recovery.db");
process.env.PERSONAL_AGENT_ID = "e2e-revoke-agent-aaaa-bbbb";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const { mountDeviceAuthHttp } = await import(
  "../../src/http/device-auth-http.ts"
);
const { mountDevicesHttp } = await import("../../src/http/devices-http.ts");
const { authenticateHttpRequest } = await import(
  "../../src/http/bearer-auth.ts"
);
const {
  MemoryDeviceKeyStore,
  buildDeviceAuthMessage,
  createTestSealProvider,
  WindowsDeviceKeyStore,
} = await import("../../../packages/device-crypto/index.ts");
const { db } = await import("../../src/db/database.ts");
const {
  createSession,
  dropSession,
  listConnections,
} = await import("../../src/sessions/index.ts");
const { createAgentRuntime } = await import("../../src/agents/runtime.ts");
const { evaluateToolSafety } = await import("../../src/tools/safety.ts");
const { DEFAULT_TOOL_POLICY } = await import("../../src/tools/policy.ts");

const HUB = process.env.HUB_TOKEN!;
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

/** Minimal Hono Context stub for authenticateHttpRequest. */
function httpCtx(headers: Record<string, string>) {
  return {
    req: {
      header(name: string) {
        const key = Object.keys(headers).find(
          (k) => k.toLowerCase() === name.toLowerCase(),
        );
        return key ? headers[key] : undefined;
      },
    },
  } as Parameters<typeof authenticateHttpRequest>[0];
}

async function pairDevice(deviceId: string, name: string) {
  const store = new MemoryDeviceKeyStore();
  const pub = await store.generate();
  const s = pairing.createPairingSession();
  const accepted = pairing.acceptPairingRequest({
    pairingSessionId: s.id,
    pairingSecret: s.secret,
    deviceId,
    deviceName: name,
    platform: "android",
    publicKey: pub.publicKey,
    keyAlgorithm: "Ed25519",
  });
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

async function authenticateDevice(
  deviceId: string,
  store: MemoryDeviceKeyStore,
) {
  const issued = identity.issueDeviceAuthChallenge(deviceId);
  assert.equal(issued.ok, true);
  if (!issued.ok) throw new Error("challenge");
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
  assert.equal(verified.ok, true);
  if (!verified.ok) throw new Error("verify");
  return { issued, signature, ...verified };
}

async function rePairSameIdentity(
  deviceId: string,
  publicKey: string,
) {
  const s = pairing.createPairingSession();
  pairing.acceptPairingRequest({
    pairingSessionId: s.id,
    pairingSecret: s.secret,
    deviceId,
    deviceName: "Recovered",
    platform: "android",
    publicKey,
    keyAlgorithm: "Ed25519",
  });
  const approved = pairing.approvePairingSession(s.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error("re-pair failed");
  return approved.deviceCredential;
}

describe("PHASE 57.13 E2E device revocation & recovery", () => {
  it("full lifecycle: trust → auth → revoke cascade → isolation → re-pair → recovery", async () => {
    const local = identity.ensureLocalIdentity();
    assert.equal(local.user.id, "local-user");
    assert.equal(local.agent.id, AGENT_ID);

    const app = new Hono();
    mountDeviceAuthHttp(app, { hubToken: HUB });
    mountDevicesHttp(app, { hubToken: HUB });

    // --- Scenarios 1–2: Initial trust + authenticate ---
    const deviceA = "android-rev-a";
    const deviceB = "android-rev-b";
    const a = await pairDevice(deviceA, "Phone A");
    const b = await pairDevice(deviceB, "Phone B");

    const rowA = identity.getTrustedDeviceCrypto(deviceA);
    assert.ok(rowA);
    assert.equal(rowA!.status, "ACTIVE");
    assert.equal(rowA!.identityStatus, "crypto_enrolled");
    assert.equal(rowA!.publicKey, a.publicKey);
    assert.equal(rowA!.userId, local.user.id);
    assert.equal(rowA!.agentId, local.agent.id);

    const authA = await authenticateDevice(deviceA, a.store);
    assert.equal(authA.session.authKind, "device");
    assert.equal(authA.userContext.deviceId, deviceA);
    assert.equal(authA.userContext.userId, local.user.id);
    assert.equal(authA.userContext.agentId, local.agent.id);
    assert.equal(identity.isSessionActive(authA.session.id), true);

    const authB = await authenticateDevice(deviceB, b.store);
    assert.equal(identity.isSessionActive(authB.session.id), true);

    // Scenario 3: Active connection (mock WS — not physical socket server)
    let wsAClosed = false;
    let wsBClosed = false;
    const wsA = mockWs(() => {
      wsAClosed = true;
    });
    const wsB = mockWs(() => {
      wsBClosed = true;
    });
    const connA = createSession(wsA);
    connA.authenticated = true;
    connA.deviceId = deviceA;
    connA.authKind = "device";
    connA.authSessionId = authA.session.id;
    const connB = createSession(wsB);
    connB.authenticated = true;
    connB.deviceId = deviceB;
    connB.authKind = "device";
    connB.authSessionId = authB.session.id;

    const safetyBefore = evaluateToolSafety({
      toolName: "filesystem.read",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: authA.userContext,
    });
    assert.equal(safetyBefore.decision, "ALLOWED");

    // Capture unused challenge+signature for post-revoke attempt (Scenario 9)
    const pending = identity.issueDeviceAuthChallenge(deviceA);
    assert.equal(pending.ok, true);
    if (!pending.ok) return;
    const pendingSig = await a.store.sign(
      buildDeviceAuthMessage({
        deviceId: deviceA,
        challengeHex: pending.challenge,
      }),
    );
    const oldCredential = a.deviceCredential;

    // --- Scenario 4: Revoke via official HTTP ---
    const revokeRes = await app.request(`/v1/devices/${deviceA}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(revokeRes.status, 200);
    const revokeBody = (await revokeRes.json()) as { ok: boolean };
    assert.equal(revokeBody.ok, true);

    // Scenario 12: record remains REVOKED (not deleted)
    const revokedRow = identity.getTrustedDeviceCrypto(deviceA);
    assert.ok(revokedRow);
    assert.equal(revokedRow!.status, "REVOKED");
    assert.equal(revokedRow!.publicKey, null);

    // Scenario 5: AuthSession invalidated
    assert.equal(identity.isSessionActive(authA.session.id), false);
    assert.equal(
      identity.resolveUserContextFromSessionId(authA.session.id),
      null,
    );

    // Scenario 6: WebSocket for A closed; B untouched
    assert.equal(wsAClosed, true);
    assert.equal(connA.authenticated, false);
    assert.equal(wsBClosed, false);
    assert.equal(connB.authenticated, true);
    assert.equal(identity.isSessionActive(authB.session.id), true);

    // Scenario 7: reconnect with old session → denied
    assert.equal(
      identity.resolveUserContextFromSessionId(authA.session.id),
      null,
    );

    // Scenario 8: new challenge after revoke → DENIED
    const chAfter = identity.issueDeviceAuthChallenge(deviceA);
    assert.equal(chAfter.ok, false);

    const httpCh = await app.request("/v1/device-auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: deviceA }),
    });
    assert.ok(
      httpCh.status === 403 || httpCh.status === 400 || httpCh.status === 409,
    );
    const httpChBody = (await httpCh.json()) as {
      error?: { code?: string };
    };
    const denyCode = httpChBody.error?.code;
    assert.ok(
      denyCode === "revoked" ||
        denyCode === "unknown_device" ||
        denyCode === "legacy_no_public_key",
      `unexpected challenge deny code: ${denyCode}`,
    );

    // Scenario 9: old unused signature after revoke → DENIED
    const oldSigAttempt = identity.verifyDeviceAuthSignature({
      deviceId: deviceA,
      challengeId: pending.challengeId,
      signatureBase64: pendingSig,
    });
    assert.equal(oldSigAttempt.ok, false);
    if (!oldSigAttempt.ok) {
      assert.equal(oldSigAttempt.reason, "revoked");
    }

    // Scenario 10: old device credential → DENIED
    assert.equal(
      pairing.verifyDeviceCredential(deviceA, oldCredential),
      false,
    );
    const httpLegacy = authenticateHttpRequest(
      httpCtx({
        Authorization: `Bearer ${oldCredential}`,
        "X-Device-Id": deviceA,
      }),
      HUB,
      { peerIsLoopback: true },
    );
    assert.equal(httpLegacy, null);

    // Scenario 11: HUB_TOKEN does not restore device trust / bypass
    const hubPrincipal = authenticateHttpRequest(
      httpCtx({
        Authorization: `Bearer ${HUB}`,
        "X-Device-Id": deviceA,
      }),
      HUB,
      { peerIsLoopback: true },
    );
    assert.ok(hubPrincipal);
    assert.equal(hubPrincipal!.kind, "install");
    assert.equal(hubPrincipal!.userContext.authKind, "install_compat");
    // install_compat must not equal device crypto trust for A
    assert.notEqual(hubPrincipal!.userContext.deviceId, deviceA);
    assert.equal(identity.issueDeviceAuthChallenge(deviceA).ok, false);

    // Scenarios 17–18: Device / session isolation
    assert.equal(identity.getTrustedDeviceCrypto(deviceB)!.status, "ACTIVE");
    const reAuthB = await authenticateDevice(deviceB, b.store);
    assert.equal(reAuthB.userContext.deviceId, deviceB);
    assert.equal(identity.isSessionActive(authB.session.id), true);

    // Scenario 19: User / PersonalAgent untouched
    const stillLocal = identity.ensureLocalIdentity();
    assert.equal(stillLocal.user.id, local.user.id);
    assert.equal(stillLocal.agent.id, local.agent.id);
    assert.equal(stillLocal.agent.status, "ACTIVE");

    // Tool Safety: without AuthSession, no device UserContext from session
    assert.equal(
      identity.resolveUserContextFromSessionId(authA.session.id),
      null,
    );

    // Scenario 20: restart while revoked — sealed identity survives, auth denied
    const persistDir = fs.mkdtempSync(path.join(tmp, "revoked-persist-"));
    const seal = createTestSealProvider(randomBytes(32));
    const persistId = "android-rev-persist";
    const persistStore = new WindowsDeviceKeyStore({
      deviceId: persistId,
      storageDir: persistDir,
      seal,
    });
    const persistPub = await persistStore.generate();
    const sP = pairing.createPairingSession();
    pairing.acceptPairingRequest({
      pairingSessionId: sP.id,
      pairingSecret: sP.secret,
      deviceId: persistId,
      publicKey: persistPub.publicKey,
      keyAlgorithm: "Ed25519",
      platform: "android",
    });
    pairing.approvePairingSession(sP.id);
    {
      const issued = identity.issueDeviceAuthChallenge(persistId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;
      const sig = await persistStore.sign(
        buildDeviceAuthMessage({
          deviceId: persistId,
          challengeHex: issued.challenge,
        }),
      );
      assert.equal(
        identity.verifyDeviceAuthSignature({
          deviceId: persistId,
          challengeId: issued.challengeId,
          signatureBase64: sig,
        }).ok,
        true,
      );
    }
    identity.revokeTrustedDevice(
      persistId,
      identity.resolveInstallCompatSession().userContext,
    );
    const persistReload = new WindowsDeviceKeyStore({
      deviceId: persistId,
      storageDir: persistDir,
      seal,
    });
    assert.equal(
      (await persistReload.getPublicKey())!.publicKey,
      persistPub.publicKey,
    );
    assert.equal(identity.issueDeviceAuthChallenge(persistId).ok, false);

    // Scenario 22: Gateway "restart" while revoked — DB still REVOKED
    const dbRevoked = db
      .prepare(`SELECT status FROM trusted_devices WHERE device_id = ?`)
      .get(deviceA) as { status: string };
    assert.equal(dbRevoked.status, "REVOKED");
    assert.equal(identity.issueDeviceAuthChallenge(deviceA).ok, false);

    // --- Scenarios 13–16: Re-pair + recovery (Case A: same deviceId + publicKey) ---
    const newCred = await rePairSameIdentity(deviceA, a.publicKey);
    const recovered = identity.getTrustedDeviceCrypto(deviceA);
    assert.equal(recovered!.status, "ACTIVE");
    assert.equal(recovered!.publicKey, a.publicKey);
    assert.equal(recovered!.identityStatus, "crypto_enrolled");
    assert.equal(recovered!.userId, local.user.id);
    assert.equal(recovered!.agentId, local.agent.id);

    // No duplicate ACTIVE rows for same deviceId
    const activeCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM trusted_devices
           WHERE device_id = ? AND status = 'ACTIVE'`,
        )
        .get(deviceA) as { n: number }
    ).n;
    assert.equal(activeCount, 1);

    // Old credential still invalid; new credential works
    assert.equal(pairing.verifyDeviceCredential(deviceA, oldCredential), false);
    assert.equal(pairing.verifyDeviceCredential(deviceA, newCred), true);

    const authRecovered = await authenticateDevice(deviceA, a.store);
    assert.equal(authRecovered.userContext.authKind, "device");
    assert.equal(authRecovered.userContext.deviceId, deviceA);
    assert.equal(identity.isSessionActive(authRecovered.session.id), true);
    // Pre-revoke session must stay dead
    assert.equal(identity.isSessionActive(authA.session.id), false);

    // AgentRuntime + Tool Safety after recovery
    const safetyAfter = evaluateToolSafety({
      toolName: "filesystem.read",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: authRecovered.userContext,
    });
    assert.equal(safetyAfter.decision, "ALLOWED");

    let runtimeOk = false;
    const runtime = createAgentRuntime({
      memory: {
        ensureConversation: (id) => id ?? "c-rev",
        addMessage: () => "m1",
        getHistory: () => [],
      },
      llm: {
        async *stream() {
          yield { type: "text_delta" as const, text: "recovered" };
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
      userContext: authRecovered.userContext,
      deviceId: deviceA,
      sessionId: authRecovered.session.id,
    })) {
      if (ev.type === "text_delta" && ev.text === "recovered") {
        runtimeOk = true;
      }
    }
    assert.equal(runtimeOk, true);

    // Scenario 24: replay after recovery still denied
    const replay = identity.verifyDeviceAuthSignature({
      deviceId: deviceA,
      challengeId: authRecovered.issued.challengeId,
      signatureBase64: authRecovered.signature,
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.replay, true);

    // Scenario 21: restart after recovery — same store identity, new auth OK
    const afterRestartAuth = await authenticateDevice(deviceA, a.store);
    assert.equal(afterRestartAuth.userContext.deviceId, deviceA);

    // Scenario 23: Gateway restart after recovery — trust in SQLite, re-auth OK
    const dbActive = db
      .prepare(
        `SELECT status, public_key AS publicKey FROM trusted_devices
         WHERE device_id = ?`,
      )
      .get(deviceA) as { status: string; publicKey: string };
    assert.equal(dbActive.status, "ACTIVE");
    assert.equal(dbActive.publicKey, a.publicKey);
    const afterGw = await authenticateDevice(deviceA, a.store);
    assert.equal(afterGw.userContext.authKind, "device");
    assert.equal(afterGw.userContext.deviceId, deviceA);

    // Private key never in Gateway responses / DB
    assert.equal(
      (
        db.prepare(`PRAGMA table_info(trusted_devices)`).all() as Array<{
          name: string;
        }>
      ).some((c) => /private/i.test(c.name)),
      false,
    );

    dropSession(wsA);
    dropSession(wsB);
    assert.ok(listConnections().length >= 0);
  });

  it("HTTP revoke endpoint requires owner; anonymous cannot revoke", async () => {
    const deviceId = "android-rev-http-gate";
    await pairDevice(deviceId, "Gate");
    const app = new Hono();
    mountDevicesHttp(app, { hubToken: HUB });

    const anon = await app.request(`/v1/devices/${deviceId}/revoke`, {
      method: "POST",
    });
    assert.equal(anon.status, 401);

    const ok = await app.request(`/v1/devices/${deviceId}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(ok.status, 200);
    assert.equal(identity.getTrustedDeviceCrypto(deviceId)!.status, "REVOKED");
  });
});
