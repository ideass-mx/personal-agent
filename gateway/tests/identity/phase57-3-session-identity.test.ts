/**
 * PHASE 57.3 — Session Identity & Scopes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-sess-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-session-compat-32ch!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "session.db");
process.env.PERSONAL_AGENT_ID = "sess-agent-uuid-aaaa-bbbb-cccc";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const {
  createSession,
  killConnectionsForAuthSession,
  dropSession,
} = await import("../../src/sessions/index.ts");
const browser = await import("../../src/http/browser-session.ts");
const {
  authenticateHttpRequest,
} = await import("../../src/http/bearer-auth.ts");

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

describe("PHASE 57.3 Session Identity & Scopes", () => {
  it("creates and resolves a valid AuthSession", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const session = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "device",
      deviceId: "dev-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.match(session.id, /^as_/);
    assert.equal(session.status, "ACTIVE");
    assert.equal(identity.isSessionActive(session.id), true);
    const loaded = identity.getAuthSessionById(session.id);
    assert.ok(loaded);
    assert.equal(loaded!.userId, user.id);
    assert.equal(loaded!.agentId, agent.id);
    assert.equal(loaded!.deviceId, "dev-1");
    assert.deepEqual([...loaded!.scopes], ["user", "agent", "device"]);
  });

  it("session belongs to User and PersonalAgent", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const session = identity.issueInstallCompatSession({
      userId: user.id,
      agentId: agent.id,
    });
    assert.equal(session.userId, user.id);
    assert.equal(session.agentId, agent.id);
    assert.notEqual(session.userId, HUB);
    assert.notEqual(session.id, HUB);
  });

  it("revoked session is inactive; expired session is inactive", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const live = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "browser",
      deviceId: "b1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(identity.revokeSession(live.id), true);
    assert.equal(identity.isSessionActive(live.id), false);
    assert.equal(identity.getAuthSessionById(live.id)?.status, "REVOKED");

    const expired = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "browser",
      deviceId: "b2",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(identity.isSessionActive(expired.id), false);
    assert.equal(identity.getAuthSessionById(expired.id)?.status, "EXPIRED");
  });

  it("UserContext derives from Session; client claims ignored", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const session = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "device",
      deviceId: "dev-ctx",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const ctx = identity.resolveUserContext({
      sessionId: session.id,
      claimedUserId: "attacker-user",
      claimedAgentId: "attacker-agent",
      deviceId: "attacker-device",
    });
    assert.equal(ctx.userId, user.id);
    assert.equal(ctx.agentId, agent.id);
    assert.equal(ctx.sessionId, session.id);
    assert.equal(ctx.deviceId, "dev-ctx");
    assert.notEqual(ctx.userId, "attacker-user");
    assert.notEqual(ctx.agentId, "attacker-agent");
  });

  it("HUB_TOKEN remains install_compat and never userId/sessionId", () => {
    const { session, userContext } = identity.resolveInstallCompatSession();
    assert.equal(session.authKind, "install_compat");
    assert.equal(userContext.authKind, "install_compat");
    assert.notEqual(userContext.userId, HUB);
    assert.notEqual(userContext.sessionId, HUB);
    identity.assertHubTokenIsNotUserId(HUB, userContext);
    identity.assertHubTokenIsNotSessionId(HUB, userContext);
  });

  it("HTTP install Bearer obtains Session + UserContext", () => {
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
    assert.match(principal!.authSessionId, /^as_/);
    assert.equal(principal!.userContext.authKind, "install_compat");
    assert.equal(principal!.userContext.sessionId, principal!.authSessionId);
    assert.notEqual(principal!.userContext.userId, HUB);
  });

  it("browser cookie is browser Session, not install", () => {
    const launch = browser.createBrowserLaunchSession({
      deviceId: "browser-dev-1",
      deviceName: "Browser",
    });
    const consumed = browser.consumeBrowserLaunchSession(launch.activationId);
    assert.ok(consumed);
    const verified = browser.verifyBrowserCookieSession(consumed!.cookieToken);
    assert.ok(verified);
    assert.equal(verified!.deviceId, "browser-dev-1");
    assert.equal(verified!.authSessionId, consumed!.authSessionId);

    const cookieHeader = `${browser.BROWSER_AUTH_COOKIE}=${encodeURIComponent(consumed!.cookieToken)}`;
    const principal = authenticateHttpRequest(
      {
        req: {
          header(name: string) {
            if (name === "Cookie" || name.toLowerCase() === "cookie") {
              return cookieHeader;
            }
            return undefined;
          },
        },
      } as unknown as Parameters<typeof authenticateHttpRequest>[0],
      HUB,
    );
    assert.ok(principal);
    assert.equal(principal!.kind, "browser");
    assert.equal(principal!.userContext.authKind, "browser");
    assert.equal(principal!.authSessionId, consumed!.authSessionId);
  });

  it("revoked browser session stops authorizing HTTP", () => {
    const launch = browser.createBrowserLaunchSession({
      deviceId: "browser-rev",
      deviceName: "Rev",
    });
    const consumed = browser.consumeBrowserLaunchSession(launch.activationId)!;
    assert.ok(browser.verifyBrowserCookieSession(consumed.cookieToken));
    identity.revokeSession(consumed.authSessionId);
    assert.equal(
      browser.verifyBrowserCookieSession(consumed.cookieToken),
      null,
    );
    const cookieHeader = `${browser.BROWSER_AUTH_COOKIE}=${encodeURIComponent(consumed.cookieToken)}`;
    const principal = authenticateHttpRequest(
      {
        req: {
          header(name: string) {
            if (name === "Cookie" || name.toLowerCase() === "cookie") {
              return cookieHeader;
            }
            return undefined;
          },
        },
      } as unknown as Parameters<typeof authenticateHttpRequest>[0],
      HUB,
    );
    assert.equal(principal, null);
  });

  it("WS connection binds AuthSession; revoke kills connection", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const auth = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "device",
      deviceId: "ws-dev",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    let closed = false;
    const ws = mockWs(() => {
      closed = true;
    });
    const conn = createSession(ws);
    conn.authenticated = true;
    conn.authSessionId = auth.id;
    conn.deviceId = "ws-dev";
    conn.authKind = "device";

    assert.equal(identity.isSessionActive(auth.id), true);
    identity.revokeSession(auth.id);
    assert.equal(identity.isSessionActive(auth.id), false);
    assert.equal(closed, true);
    assert.equal(conn.authenticated, false);
    dropSession(ws);
  });

  it("connection cannot change identity after auth", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const a = identity.issueAuthSession({
      userId: user.id,
      agentId: agent.id,
      authKind: "device",
      deviceId: "fixed-dev",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const ctx1 = identity.userContextFromAuthSession(a);
    const ctx2 = identity.resolveUserContext({
      sessionId: a.id,
      claimedUserId: "other",
      claimedAgentId: "other-agent",
      deviceId: "other-device",
    });
    assert.equal(ctx1.userId, ctx2.userId);
    assert.equal(ctx1.agentId, ctx2.agentId);
    assert.equal(ctx1.deviceId, ctx2.deviceId);
    assert.equal(ctx1.sessionId, ctx2.sessionId);
  });

  it("sessionId reaches UserContext for AgentRuntime boundary", () => {
    const { session, userContext } = identity.resolveInstallCompatSession();
    assert.equal(userContext.sessionId, session.id);
    assert.match(userContext.sessionId!, /^as_/);
  });

  it("killConnectionsForAuthSession is idempotent for unknown id", () => {
    assert.equal(killConnectionsForAuthSession("as_missing"), 0);
  });
});
