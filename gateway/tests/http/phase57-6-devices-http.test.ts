/**
 * PHASE 57.6 — Trusted Devices owner-scoped API.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-6-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-devices-ui-phase576!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "devices.db");
process.env.PERSONAL_AGENT_ID = "devices-agent-uuid-aaaa-bbbb";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const { mountDevicesHttp } = await import("../../src/http/devices-http.ts");
const {
  createSession,
  dropSession,
} = await import("../../src/sessions/index.ts");

const HUB = process.env.HUB_TOKEN!;

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

function pairDevice(deviceId: string, name: string): string {
  const s = pairing.createPairingSession();
  pairing.acceptPairingRequest({
    pairingSessionId: s.id,
    pairingSecret: s.secret,
    deviceId,
    deviceName: name,
    platform: "android",
  });
  const approved = pairing.approvePairingSession(s.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error("approve failed");
  return approved.deviceCredential;
}

describe("PHASE 57.6 Trusted Devices API", () => {
  it("owner lists devices; revoke kills sessions/WS; other device survives", async () => {
    identity.ensureLocalIdentity();
    const credA = pairDevice("ui-dev-a", "Phone A");
    const credB = pairDevice("ui-dev-b", "Phone B");
    assert.equal(pairing.verifyDeviceCredential("ui-dev-a", credA), true);

    const sessA = identity.resolveDeviceAuthSession({ deviceId: "ui-dev-a" });
    const sessB = identity.resolveDeviceAuthSession({ deviceId: "ui-dev-b" });
    let closedA = false;
    const wsA = mockWs(() => {
      closedA = true;
    });
    const connA = createSession(wsA);
    connA.authenticated = true;
    connA.deviceId = "ui-dev-a";
    connA.authSessionId = sessA.session.id;

    const app = new Hono();
    mountDevicesHttp(app, { hubToken: HUB });

    const listed = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(listed.status, 200);
    const listJson = (await listed.json()) as {
      devices: Array<{ deviceId: string; status: string; name: string }>;
    };
    const ids = listJson.devices.map((d) => d.deviceId);
    assert.ok(ids.includes("ui-dev-a"));
    assert.ok(ids.includes("ui-dev-b"));
    assert.ok(
      listJson.devices.every(
        (d) => !("permissions" in d) && !("credentialHash" in d),
      ),
    );

    const revoked = await app.request("/v1/devices/ui-dev-a/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(revoked.status, 200);
    const revJson = (await revoked.json()) as {
      ok: boolean;
      status: string;
      sessionsRevoked: number;
    };
    assert.equal(revJson.ok, true);
    assert.equal(revJson.status, "REVOKED");
    assert.ok(revJson.sessionsRevoked >= 1);
    assert.equal(closedA, true);
    assert.equal(identity.isSessionActive(sessA.session.id), false);
    assert.equal(identity.isSessionActive(sessB.session.id), true);
    assert.equal(pairing.verifyDeviceCredential("ui-dev-a", credA), false);
    assert.equal(pairing.verifyDeviceCredential("ui-dev-b", credB), true);

    const { user, agent } = identity.ensureLocalIdentity();
    assert.equal(user.id, identity.LOCAL_USER_ID);
    assert.equal(agent.id, "devices-agent-uuid-aaaa-bbbb");

    dropSession(wsA);
  });

  it("foreign owner UserContext cannot revoke", () => {
    pairDevice("foreign-guard", "Guard");
    const fake = {
      userId: "other-user",
      agentId: "devices-agent-uuid-aaaa-bbbb",
      authKind: "install_compat" as const,
      sessionId: "as_x",
    };
    const rev = identity.revokeTrustedDevice("foreign-guard", fake);
    assert.equal(rev.ok, false);
    if (rev.ok) return;
    assert.equal(rev.code, "owner_mismatch");
  });

  it("revoked device cannot authenticate again", () => {
    const cred = pairDevice("ui-revoked-auth", "Gone");
    const owner = identity.resolveInstallCompatSession().userContext;
    identity.revokeTrustedDevice("ui-revoked-auth", owner);
    assert.equal(pairing.verifyDeviceCredential("ui-revoked-auth", cred), false);
  });

  it("unauthenticated list is rejected", async () => {
    const app = new Hono();
    mountDevicesHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/devices");
    assert.equal(res.status, 401);
  });
});
