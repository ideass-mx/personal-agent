/**
 * PHASE 56.1-D — Pairing revoke, accept race, approve idempotency.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-56-1d-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "c".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "t.db");
process.env.PERSONAL_AGENT_ID = "33333333-3333-4333-8333-333333333333";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const store = await import("../../src/pairing/store.ts");
const waiters = await import("../../src/pairing/waiters.ts");

describe("PHASE 56.1-D pairing hardening", () => {
  it("active device auth OK; revoke → auth FAIL; revoke idempotent", () => {
    const s = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-revoke-1",
      deviceName: "Phone",
    });
    const approved = store.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const cred = approved.deviceCredential;
    assert.equal(store.verifyDeviceCredential("android-revoke-1", cred), true);

    const rev = store.revokeTrustedDevice("android-revoke-1");
    assert.equal(rev.ok, true);
    if (!rev.ok) return;
    assert.equal(rev.status, "REVOKED");
    assert.equal(rev.alreadyRevoked, false);
    assert.equal(store.verifyDeviceCredential("android-revoke-1", cred), false);

    const again = store.revokeTrustedDevice("android-revoke-1");
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.alreadyRevoked, true);
    assert.equal(store.verifyDeviceCredential("android-revoke-1", cred), false);
  });

  it("second accept from different device fails deterministically", () => {
    const s = store.createPairingSession();
    const a = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "device-a",
    });
    assert.equal(a.ok, true);
    const b = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "device-b",
    });
    assert.equal(b.ok, false);
    const row = store.getPairingSession(s.id);
    assert.equal(row?.deviceId, "device-a");
  });

  it("same device re-accept is idempotent", () => {
    const s = store.createPairingSession();
    assert.equal(
      store.acceptPairingRequest({
        pairingSessionId: s.id,
        pairingSecret: s.secret,
        deviceId: "device-same",
      }).ok,
      true,
    );
    assert.equal(
      store.acceptPairingRequest({
        pairingSessionId: s.id,
        pairingSecret: s.secret,
        deviceId: "device-same",
      }).ok,
      true,
    );
  });

  it("second approve fails; credential plaintext not re-issued", () => {
    const s = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-once",
    });
    const first = store.approvePairingSession(s.id);
    assert.equal(first.ok, true);
    const second = store.approvePairingSession(s.id);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.code, "pairing_already_approved");
    }
  });

  it("concurrent accept race: only one device wins", () => {
    const s = store.createPairingSession();
    const results = ["race-1", "race-2", "race-3"].map((deviceId) =>
      store.acceptPairingRequest({
        pairingSessionId: s.id,
        pairingSecret: s.secret,
        deviceId,
      }),
    );
    const oks = results.filter((r) => r.ok);
    assert.equal(oks.length, 1);
    const row = store.getPairingSession(s.id);
    assert.equal(row?.status, "AWAITING_CONFIRMATION");
    assert.ok(row?.deviceId);
  });

  it("waiter: second distinct device rejected (no last-writer-wins)", () => {
    waiters.clearPairingWaitersForTests();
    const fakeWs = { readyState: 1 } as unknown as import("ws").WebSocket;
    const fakeWs2 = { readyState: 1 } as unknown as import("ws").WebSocket;
    const r1 = waiters.registerPairingWaiter("ps_test", {
      ws: fakeWs,
      deviceId: "d1",
      pairingSessionId: "ps_test",
    });
    assert.equal(r1.ok, true);
    const r2 = waiters.registerPairingWaiter("ps_test", {
      ws: fakeWs2,
      deviceId: "d2",
      pairingSessionId: "ps_test",
    });
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.code, "pairing_waiter_busy");
    const taken = waiters.takePairingWaiter("ps_test");
    assert.equal(taken?.deviceId, "d1");
  });
});

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
