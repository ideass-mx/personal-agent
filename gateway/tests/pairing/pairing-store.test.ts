/**
 * Pairing Session + Trusted Device unit tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-pair-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "a".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "t.db");
process.env.PERSONAL_AGENT_ID = "11111111-1111-4111-8111-111111111111";

const { runMigrations, db } = await import("../../src/db/database.ts");
runMigrations();

const store = await import("../../src/pairing/store.ts");

describe("Pairing Session", () => {
  it("creates pending session", () => {
    const s = store.createPairingSession();
    assert.match(s.id, /^ps_/);
    assert.equal(s.secret.length, 64);
    const row = store.getPairingSession(s.id);
    assert.equal(row?.status, "PENDING");
  });

  it("expires after configured TTL (forced)", () => {
    const s = store.createPairingSession();
    db.prepare(
      `UPDATE pairing_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`,
    ).run(s.id);
    const r = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-exp",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "pairing_expired");
    assert.equal(store.getPairingSession(s.id)?.status, "EXPIRED");
  });

  it("rejects invalid secret", () => {
    const s = store.createPairingSession();
    const r = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: "deadbeef",
      deviceId: "android-1",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "pairing_invalid");
  });

  it("rejects reused / consumed session", () => {
    const s = store.createPairingSession();
    const ok = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-2",
      deviceName: "Phone",
    });
    assert.equal(ok.ok, true);
    const approved = store.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    const again = store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-2",
    });
    assert.equal(again.ok, false);
  });

  it("consumes successful session and creates trusted device", () => {
    const s = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-3",
      deviceName: "Xiaomi",
      platform: "android",
    });
    const approved = store.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.ok(approved.deviceCredential.length >= 32);
    assert.equal(
      store.verifyDeviceCredential("android-3", approved.deviceCredential),
      true,
    );
    assert.equal(store.verifyDeviceCredential("android-3", "wrong"), false);
    const devices = store.listTrustedDevices();
    assert.ok(devices.some((d: { deviceId: string }) => d.deviceId === "android-3"));
  });

  it("rejected pairing does not create trusted device", () => {
    const s = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-reject",
    });
    store.rejectPairingSession(s.id);
    assert.equal(
      store
        .listTrustedDevices()
        .some((d: { deviceId: string }) => d.deviceId === "android-reject"),
      false,
    );
  });

  it("QR URI contains temporary session and NOT HUB_TOKEN", () => {
    const s = store.createPairingSession();
    const uri = store.buildPairingUri({
      agentId: "agent-1",
      endpoint: "ws://100.64.0.1:8787/ws",
      pairingSessionId: s.id,
      pairingSecret: s.secret,
    });
    assert.match(uri, /^personalagent:\/\/pair\?/);
    assert.equal(uri.toLowerCase().includes("hub_token"), false);
    assert.equal(uri.includes(process.env.HUB_TOKEN!), false);
    assert.match(uri, /session=/);
    assert.match(uri, /secret=/);
    assert.equal(uri.includes("BEGIN PRIVATE"), false);
  });

  it("preserves existing trusted devices on re-approve same deviceId", () => {
    const s1 = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s1.id,
      pairingSecret: s1.secret,
      deviceId: "android-keep",
      deviceName: "A",
    });
    const a1 = store.approvePairingSession(s1.id);
    assert.equal(a1.ok, true);
    const s2 = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s2.id,
      pairingSecret: s2.secret,
      deviceId: "android-keep",
      deviceName: "B",
    });
    const a2 = store.approvePairingSession(s2.id);
    assert.equal(a2.ok, true);
    const devices = store
      .listTrustedDevices()
      .filter((d: { deviceId: string }) => d.deviceId === "android-keep");
    assert.equal(devices.length, 1);
  });

  it("expired session implies new QR (new session id)", () => {
    const old = store.createPairingSession();
    db.prepare(
      `UPDATE pairing_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`,
    ).run(old.id);
    store.getPairingSession(old.id); // expire
    const neu = store.createPairingSession();
    assert.notEqual(neu.id, old.id);
    assert.equal(store.getPairingSession(old.id)?.status, "EXPIRED");
    assert.equal(store.getPairingSession(neu.id)?.status, "PENDING");
  });

  it("legacy HUB_TOKEN env remains available for install auth path", () => {
    assert.equal(process.env.HUB_TOKEN?.length, 32);
    // Device path does not use HUB_TOKEN
    const s = store.createPairingSession();
    assert.equal(s.secret.includes(process.env.HUB_TOKEN!), false);
  });

  it("pairing secret never appears in persisted session row or getPairingSession", () => {
    const s = store.createPairingSession();
    const row = store.getPairingSession(s.id);
    assert.ok(row);
    assert.equal(
      Object.prototype.hasOwnProperty.call(row, "secret"),
      false,
    );
    const dbRow = db
      .prepare(`SELECT * FROM pairing_sessions WHERE id = ?`)
      .get(s.id) as Record<string, unknown>;
    assert.ok(dbRow.secret_hash);
    assert.equal(dbRow.secret, undefined);
    assert.equal(JSON.stringify(dbRow).includes(s.secret), false);
  });
});

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
