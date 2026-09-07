/**
 * PHASE 57.4 — Owner Authority & Trusted Device Revocation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-4-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-owner-phase574-32ch!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "owner.db");
process.env.PERSONAL_AGENT_ID = "owner-agent-uuid-aaaa-bbbb-cccc";
// Ensure default loopback in this process (config reads at import).
delete process.env.HUB_HOST;

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const {
  createSession,
  dropSession,
  killConnectionsForDevice,
} = await import("../../src/sessions/index.ts");
const { config } = await import("../../src/config.ts");
const { authenticateHttpRequest } = await import(
  "../../src/http/bearer-auth.ts"
);

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

describe("PHASE 57.4 Owner Authority & Device Revocation", () => {
  it("owner UserContext matches PersonalAgent.userId", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const { userContext } = identity.resolveInstallCompatSession();
    assert.equal(userContext.userId, user.id);
    assert.equal(userContext.agentId, agent.id);
    assert.equal(identity.isAgentOwner(userContext), true);
    assert.equal(userContext.authKind, "install_compat");
    assert.notEqual(userContext.userId, HUB);
  });

  it("session cannot change userId/agentId via client claims", () => {
    const { session } = identity.resolveInstallCompatSession();
    const ctx = identity.resolveUserContext({
      sessionId: session.id,
      claimedUserId: "evil-user",
      claimedAgentId: "evil-agent",
    });
    assert.equal(ctx.userId, identity.LOCAL_USER_ID);
    assert.equal(ctx.agentId, "owner-agent-uuid-aaaa-bbbb-cccc");
    assert.notEqual(ctx.userId, "evil-user");
  });

  it("install_compat is not a different User", () => {
    const a = identity.resolveInstallCompatSession().userContext;
    const b = identity.resolveInstallCompatSession().userContext;
    assert.equal(a.userId, b.userId);
    assert.equal(a.agentId, b.agentId);
    assert.equal(a.authKind, "install_compat");
  });

  it("multiple Devices belong to same User/Agent without roles", () => {
    pairDevice("dev-phone", "Phone");
    pairDevice("dev-laptop", "Laptop");
    const devices = pairing.listTrustedDevices().filter(
      (d) => d.deviceId === "dev-phone" || d.deviceId === "dev-laptop",
    );
    assert.equal(devices.length, 2);
    for (const d of devices) {
      const own = pairing.getTrustedDeviceOwnership(d.deviceId)!;
      assert.equal(own.userId, identity.LOCAL_USER_ID);
      assert.equal(own.agentId, "owner-agent-uuid-aaaa-bbbb-cccc");
      assert.equal(own.status, "ACTIVE");
    }
  });

  it("revokeTrustedDevice cascades sessions and kills WS; other device survives", () => {
    const credA = pairDevice("rev-a", "A");
    const credB = pairDevice("rev-b", "B");
    assert.equal(pairing.verifyDeviceCredential("rev-a", credA), true);
    assert.equal(pairing.verifyDeviceCredential("rev-b", credB), true);

    const sessA1 = identity.resolveDeviceAuthSession({ deviceId: "rev-a" });
    const sessA2 = identity.resolveDeviceAuthSession({ deviceId: "rev-a" });
    const sessB = identity.resolveDeviceAuthSession({ deviceId: "rev-b" });
    assert.equal(identity.isSessionActive(sessA1.session.id), true);
    assert.equal(identity.isSessionActive(sessA2.session.id), true);
    assert.equal(identity.isSessionActive(sessB.session.id), true);

    let closedA = false;
    const wsA = mockWs(() => {
      closedA = true;
    });
    const connA = createSession(wsA);
    connA.authenticated = true;
    connA.deviceId = "rev-a";
    connA.authSessionId = sessA1.session.id;
    connA.authKind = "device";

    let closedB = false;
    const wsB = mockWs(() => {
      closedB = true;
    });
    const connB = createSession(wsB);
    connB.authenticated = true;
    connB.deviceId = "rev-b";
    connB.authSessionId = sessB.session.id;
    connB.authKind = "device";

    const ownerCtx = identity.resolveInstallCompatSession().userContext;
    const rev = identity.revokeTrustedDevice("rev-a", ownerCtx);
    assert.equal(rev.ok, true);
    if (!rev.ok) return;
    assert.equal(rev.status, "REVOKED");
    assert.ok(rev.sessionsRevoked.includes(sessA1.session.id));
    assert.ok(rev.sessionsRevoked.includes(sessA2.session.id));
    assert.equal(closedA, true);
    assert.equal(connA.authenticated, false);
    assert.equal(closedB, false);
    assert.equal(connB.authenticated, true);

    assert.equal(pairing.verifyDeviceCredential("rev-a", credA), false);
    assert.equal(pairing.verifyDeviceCredential("rev-b", credB), true);
    assert.equal(identity.isSessionActive(sessA1.session.id), false);
    assert.equal(identity.isSessionActive(sessA2.session.id), false);
    assert.equal(identity.isSessionActive(sessB.session.id), true);

    const { user, agent } = identity.ensureLocalIdentity();
    assert.ok(user.id);
    assert.ok(agent.id);
    assert.equal(pairing.getTrustedDeviceOwnership("rev-a")?.status, "REVOKED");
    assert.equal(pairing.getTrustedDeviceOwnership("rev-b")?.status, "ACTIVE");

    dropSession(wsA);
    dropSession(wsB);
  });

  it("revoked device AuthSession rejects HTTP cookie-equivalent resolve", () => {
    pairDevice("http-rev", "HttpRev");
    const { session, userContext } = identity.resolveDeviceAuthSession({
      deviceId: "http-rev",
    });
    assert.equal(identity.isSessionActive(session.id), true);
    const owner = identity.resolveInstallCompatSession().userContext;
    identity.revokeTrustedDevice("http-rev", owner);
    assert.equal(identity.isSessionActive(session.id), false);
    assert.equal(
      identity.resolveUserContextFromSessionId(session.id),
      null,
    );
    assert.equal(userContext.deviceId, "http-rev");
  });

  it("non-owner UserContext cannot revoke device", () => {
    pairDevice("guard-dev", "Guard");
    const fakeCtx = {
      userId: "other-user",
      agentId: "owner-agent-uuid-aaaa-bbbb-cccc",
      authKind: "install_compat" as const,
      sessionId: "as_fake",
    };
    const rev = identity.revokeTrustedDevice("guard-dev", fakeCtx);
    assert.equal(rev.ok, false);
    if (rev.ok) return;
    assert.equal(rev.code, "owner_mismatch");
    assert.equal(
      pairing.getTrustedDeviceOwnership("guard-dev")?.status,
      "ACTIVE",
    );
  });

  it("HTTP install principal carries owner UserContext", () => {
    const principal = authenticateHttpRequest(
      {
        req: {
          header(name: string) {
            if (name === "Authorization") return `Bearer ${HUB}`;
            return undefined;
          },
        },
      } as unknown as Parameters<typeof authenticateHttpRequest>[0],
      HUB,
    );
    assert.ok(principal);
    assert.equal(principal!.kind, "install");
    assert.equal(identity.isAgentOwner(principal!.userContext), true);
    assert.equal(identity.isInstallCompatTransport(principal!.userContext), true);
  });

  it("Gateway default bind is loopback (not 0.0.0.0)", () => {
    const cfgSrc = fs.readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/config.ts",
      ),
      "utf8",
    );
    const serverSrc = fs.readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/http/server.ts",
      ),
      "utf8",
    );
    assert.match(cfgSrc, /bindHost:\s*\(process\.env\.HUB_HOST[\s\S]*"127\.0\.0\.1"\)/);
    assert.match(serverSrc, /hostname:\s*config\.bindHost/);
    assert.doesNotMatch(serverSrc, /hostname:\s*["']0\.0\.0\.0["']/);
    assert.equal(config.bindHost === "127.0.0.1" || config.bindHost.length > 0, true);
  });

  it("killConnectionsForDevice closes matching sockets only", () => {
    let closed = false;
    const ws = mockWs(() => {
      closed = true;
    });
    const conn = createSession(ws);
    conn.deviceId = "kill-only";
    conn.authenticated = true;
    assert.equal(killConnectionsForDevice("kill-only"), 1);
    assert.equal(closed, true);
    assert.equal(conn.authenticated, false);
    dropSession(ws);
  });
});
