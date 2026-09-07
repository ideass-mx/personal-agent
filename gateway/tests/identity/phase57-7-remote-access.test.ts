/**
 * PHASE 57.7 — Remote access hardening (defaults, health, attack paths).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-7-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-remote-access-phase577!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "remote.db");
process.env.PERSONAL_AGENT_ID = "remote-agent-uuid-aaaa-bbbb";
// Keep default loopback for this suite (do not set HUB_HOST).

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { config } = await import("../../src/config.ts");
const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const {
  authenticateHttpRequest,
} = await import("../../src/http/bearer-auth.ts");
const {
  requireOwnerHost,
} = await import("../../src/http/owner-auth.ts");
const { mountDevicesHttp } = await import("../../src/http/devices-http.ts");
const { mountBrowserBootstrapHttp } = await import(
  "../../src/http/browser-bootstrap-http.ts"
);
const {
  isLoopbackBind,
  isRemoteAccessEnabled,
  isLocalPeer,
  isLoopbackAddress,
  ENDPOINT_EXPOSURE_NOTES,
} = await import("../../src/http/remote-access.ts");
const { evaluateToolSafety } = await import("../../src/tools/safety.ts");
const { DEFAULT_TOOL_POLICY } = await import("../../src/tools/policy.ts");
const {
  createSession,
  dropSession,
  killConnectionsForDevice,
} = await import("../../src/sessions/index.ts");
const { BROWSER_AUTH_COOKIE } = await import(
  "../../src/http/browser-session.ts"
);

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

function fakeCtx(headers: Record<string, string | undefined>) {
  return {
    req: {
      header(name: string) {
        return headers[name] ?? headers[name.toLowerCase()];
      },
    },
  } as unknown as Parameters<typeof authenticateHttpRequest>[0];
}

describe("PHASE 57.7 remote access hardening", () => {
  it("default bind is loopback; remote access disabled by default", () => {
    assert.equal(isLoopbackBind("127.0.0.1"), true);
    assert.equal(isRemoteAccessEnabled("127.0.0.1"), false);
    assert.equal(isRemoteAccessEnabled("0.0.0.0"), true);
    assert.equal(isRemoteAccessEnabled("192.168.1.10"), true);
    assert.equal(config.bindHost === "127.0.0.1" || isLoopbackBind(config.bindHost), true);

    const cfgSrc = fs.readFileSync(
      path.join(here, "../../src/config.ts"),
      "utf8",
    );
    assert.match(
      cfgSrc,
      /bindHost:\s*\(process\.env\.HUB_HOST[\s\S]*"127\.0\.0\.1"\)/,
    );
    assert.doesNotMatch(cfgSrc, /bindHost:\s*["']0\.0\.0\.0["']/);
  });

  it("off-loopback bind is explicit; LAN peer ≠ local without trust", () => {
    assert.equal(
      isLocalPeer({ bindHost: "127.0.0.1", peerAddress: "192.168.1.5" }),
      true,
      "loopback bind: TCP already local",
    );
    assert.equal(
      isLocalPeer({ bindHost: "0.0.0.0", peerAddress: "192.168.1.5" }),
      false,
    );
    assert.equal(
      isLocalPeer({ bindHost: "0.0.0.0", peerAddress: "127.0.0.1" }),
      true,
    );
    assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
    assert.equal(isLoopbackAddress("10.0.0.2"), false);
  });

  it("health: loopback diagnostic vs remote minimal (isLoopbackRequest)", async () => {
    const { isLoopbackRequest } = await import(
      "../../src/http/remote-access.ts"
    );
    const app = new Hono();
    app.get("/health", (c) => {
      if (!isLoopbackRequest(c)) return c.json({ ok: true });
      return c.json({
        ok: true,
        name: "personal-agent-api",
        devices: [],
        agentTools: ["filesystem.read"],
      });
    });

    const local = await app.request("/health");
    assert.equal(local.status, 200);
    const localJson = (await local.json()) as Record<string, unknown>;
    assert.equal(localJson.ok, true);
    assert.equal(localJson.name, "personal-agent-api");
    assert.ok("agentTools" in localJson);

    const prev = config.bindHost;
    (config as { bindHost: string }).bindHost = "0.0.0.0";
    try {
      const remoteRes = await app.request("/health");
      const remoteJson = (await remoteRes.json()) as Record<string, unknown>;
      assert.equal(remoteJson.ok, true);
      assert.equal(Object.keys(remoteJson).length, 1);
      assert.equal("devices" in remoteJson, false);
      assert.equal("agentTools" in remoteJson, false);
    } finally {
      (config as { bindHost: string }).bindHost = prev;
    }
  });

  it("attack: IP+port alone / random Bearer / HUB_TOKEN remote → rejected", () => {
    // 1) No auth
    assert.equal(authenticateHttpRequest(fakeCtx({}), HUB), null);

    // 2) Random bearer
    assert.equal(
      authenticateHttpRequest(
        fakeCtx({ Authorization: "Bearer totally-random-token" }),
        HUB,
      ),
      null,
    );

    // 3) HUB_TOKEN from "LAN" peer (install_compat must not become Trusted Device)
    assert.equal(
      authenticateHttpRequest(
        fakeCtx({ Authorization: `Bearer ${HUB}` }),
        HUB,
        { peerIsLoopback: false },
      ),
      null,
    );

    // Local install_compat still works
    const local = authenticateHttpRequest(
      fakeCtx({ Authorization: `Bearer ${HUB}` }),
      HUB,
      { peerIsLoopback: true },
    );
    assert.ok(local);
    assert.equal(local!.kind, "install");
  });

  it("attack: remote /v1/devices without trust rejected; trusted device accepted", async () => {
    identity.ensureLocalIdentity();
    const cred = pairDevice("remote-dev-ok", "Phone Remote");
    const app = new Hono();
    mountDevicesHttp(app, { hubToken: HUB });

    const anon = await app.request("/v1/devices");
    assert.equal(anon.status, 401);

    const hubRemote = authenticateHttpRequest(
      fakeCtx({ Authorization: `Bearer ${HUB}` }),
      HUB,
      { peerIsLoopback: false },
    );
    assert.equal(hubRemote, null);

    const withHub = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    // Loopback bind ⇒ install_compat still works on app.request (Desktop host)
    assert.equal(withHub.status, 200);

    const withDevice = await app.request("/v1/devices", {
      headers: {
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "remote-dev-ok",
      },
    });
    assert.equal(withDevice.status, 200);

    // Explicit remote peer + device credential via authenticateHttpRequest
    const remoteDevice = authenticateHttpRequest(
      fakeCtx({
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "remote-dev-ok",
      }),
      HUB,
      { peerIsLoopback: false },
    );
    assert.ok(remoteDevice);
    assert.equal(remoteDevice!.kind, "device");
  });

  it("attack: browser-session mint rejected without auth; remote peer blocked", async () => {
    const real = new Hono();
    mountBrowserBootstrapHttp(real, { hubToken: HUB });
    const noAuth = await real.request("/v1/host/browser-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(noAuth.status, 401);

    const remoteGate = new Hono();
    remoteGate.post("/v1/host/browser-sessions", async (c) => {
      const gated = requireOwnerHost(c, HUB, { peerIsLoopback: false });
      if (gated instanceof Response) return gated;
      return c.json({ ok: true });
    });
    const remoteMint = await remoteGate.request("/v1/host/browser-sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(remoteMint.status, 403);
    const body = (await remoteMint.json()) as { error: { code: string } };
    assert.equal(body.error.code, "localhost_only");
  });

  it("attack: revoked device reconnect rejected; expired session inactive; revoke kills WS", () => {
    const cred = pairDevice("remote-revoke-me", "Revoke Me");
    const { session } = identity.resolveDeviceAuthSession({
      deviceId: "remote-revoke-me",
    });
    assert.equal(identity.isSessionActive(session.id), true);

    let closed = false;
    const ws = mockWs(() => {
      closed = true;
    });
    const conn = createSession(ws);
    conn.authenticated = true;
    conn.deviceId = "remote-revoke-me";
    conn.authSessionId = session.id;
    conn.remoteAddress = "192.168.1.50";

    const owner = identity.resolveInstallCompatSession().userContext;
    const rev = identity.revokeTrustedDevice("remote-revoke-me", owner);
    assert.equal(rev.ok, true);
    assert.equal(closed, true);
    assert.equal(identity.isSessionActive(session.id), false);
    assert.equal(
      pairing.verifyDeviceCredential("remote-revoke-me", cred),
      false,
    );

    assert.equal(
      authenticateHttpRequest(
        fakeCtx({
          Authorization: `Bearer ${cred}`,
          "X-Device-Id": "remote-revoke-me",
        }),
        HUB,
        { peerIsLoopback: false },
      ),
      null,
    );

    pairDevice("remote-expire", "Expire Me");
    const { session: s2 } = identity.resolveDeviceAuthSession({
      deviceId: "remote-expire",
    });
    assert.equal(identity.revokeSession(s2.id), true);
    assert.equal(identity.isSessionActive(s2.id), false);
    dropSession(ws);
  });

  it("remote tool_call still goes through evaluateToolSafety (no bypass)", () => {
    const owner = identity.resolveInstallCompatSession().userContext;
    const remoteCtx = {
      ...owner,
      deviceId: "remote-dev-ok",
      authKind: "device" as const,
    };
    const denied = evaluateToolSafety({
      toolName: "customer.test",
      policy: DEFAULT_TOOL_POLICY,
      userContext: remoteCtx,
    });
    assert.equal(denied.decision, "DENIED");

    const allowed = evaluateToolSafety({
      toolName: "filesystem.read",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: remoteCtx,
    });
    assert.equal(allowed.decision, "ALLOWED");

    const runtimeSrc = fs.readFileSync(
      path.join(here, "../../src/agents/runtime.ts"),
      "utf8",
    );
    assert.match(runtimeSrc, /evaluateToolSafety/);
    assert.doesNotMatch(
      runtimeSrc,
      /remote.*skip.*evaluateToolSafety|bypass.*tool.?safety/i,
    );
  });

  it("browser cookie remains HttpOnly; no HUB_TOKEN in bootstrap JS", () => {
    const sessionSrc = fs.readFileSync(
      path.join(here, "../../src/http/browser-session.ts"),
      "utf8",
    );
    assert.match(sessionSrc, /HttpOnly/);
    assert.match(sessionSrc, /SameSite=Strict/);
    assert.match(sessionSrc, new RegExp(BROWSER_AUTH_COOKIE));
    assert.match(sessionSrc, /token:\s*""/);
    assert.doesNotMatch(sessionSrc, /HUB_TOKEN/);
  });

  it("endpoint exposure notes document OWNER_LOCAL vs OWNER_REMOTE", () => {
    assert.match(ENDPOINT_EXPOSURE_NOTES["/health"], /PUBLIC_LOCAL|minimal/);
    assert.match(ENDPOINT_EXPOSURE_NOTES["/v1/devices"], /OWNER_REMOTE/);
    assert.match(
      ENDPOINT_EXPOSURE_NOTES["/v1/host/browser-sessions"],
      /OWNER_LOCAL/,
    );
    assert.match(ENDPOINT_EXPOSURE_NOTES["/ws"], /install_compat local-only/);
  });

  it("requireAgentOwner works for remote device principal", () => {
    const cred = pairDevice("owner-remote", "Owner Remote");
    const principal = authenticateHttpRequest(
      fakeCtx({
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "owner-remote",
      }),
      HUB,
      { peerIsLoopback: false },
    );
    assert.ok(principal);
    assert.equal(identity.isAgentOwner(principal!.userContext), true);

    // killConnections helper still available for revoke cascade
    const ws = mockWs();
    const conn = createSession(ws);
    conn.deviceId = "owner-remote";
    conn.authenticated = true;
    assert.equal(killConnectionsForDevice("owner-remote"), 1);
    dropSession(ws);
  });
});
