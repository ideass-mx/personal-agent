"use strict";

/**
 * PHASE 57.10 — Desktop host device identity (in-process).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, before } = require("node:test");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-desk-5710-"));
process.env.PERSONAL_AGENT_DATA_DIR = tmp;

const {
  ensureHostDeviceId,
  ensureHostDeviceCryptoInProcess,
} = require("../lib/device-identity.cjs");

describe("PHASE 57.10 desktop host device identity", () => {
  it("ensureHostDeviceId is stable across calls", () => {
    const a = ensureHostDeviceId();
    const b = ensureHostDeviceId();
    assert.equal(a.deviceId, b.deviceId);
    assert.match(a.deviceId, /^desktop-/);
  });

  it("crypto identity persists publicKey across recreate", () => {
    const first = ensureHostDeviceCryptoInProcess();
    assert.equal(first.ok, true);
    const second = ensureHostDeviceCryptoInProcess();
    assert.equal(second.ok, true);
    assert.equal(second.publicKey, first.publicKey);
    assert.equal(second.deviceId, first.deviceId);
    assert.equal(second.created, false);

    const dir = path.join(tmp, "device-identity", first.deviceId);
    const meta = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
    assert.doesNotMatch(meta, /private|BEGIN|pkcs8/i);
    assert.ok(fs.existsSync(path.join(dir, "sealed.dpapi")));
  });
});
