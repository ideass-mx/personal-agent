/**
 * PHASE 58.3 — Browser AuthSession may call local product setup routes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-58-3-setup-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "c".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "33333333-3333-4333-8333-333333333333";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
identity.ensureLocalIdentity();

const { mountSetupHttp } = await import("../../src/http/setup-http.ts");
const {
  BROWSER_AUTH_COOKIE,
  createBrowserLaunchSession,
  consumeBrowserLaunchSession,
} = await import("../../src/http/browser-session.ts");
const {
  SetupStates,
  replaceSetupStateForTests,
} = await import("../../src/setup/index.ts");
const { isSessionActive, revokeSession } = await import(
  "../../src/identity/index.ts"
);

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function appWithSetup() {
  const app = new Hono();
  mountSetupHttp(app, { hubToken: HUB });
  return app;
}

function mintBrowserCookie(): string {
  const created = createBrowserLaunchSession({
    deviceId: "browser_test_58_3",
    deviceName: "Navegador",
  });
  const consumed = consumeBrowserLaunchSession(created.activationId);
  assert.ok(consumed);
  assert.equal(isSessionActive(consumed!.authSessionId), true);
  return `${BROWSER_AUTH_COOKIE}=${encodeURIComponent(consumed!.cookieToken)}`;
}

describe("PHASE 58.3 browser AuthSession → local setup", () => {
  it("A: browser AuthSession owner local → setup/status 200", async () => {
    replaceSetupStateForTests({
      state: SetupStates.AGENT_READY,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const app = appWithSetup();
    const cookie = mintBrowserCookie();
    const res = await app.request("/v1/setup/status", {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      llmConfigured: boolean;
      state: string;
      error?: { code: string };
    };
    assert.equal(body.error?.code, undefined);
    assert.equal(body.llmConfigured, false);
    assert.equal(body.state, SetupStates.AGENT_READY);
  });

  it("B: revoked browser session → DENIED", async () => {
    const created = createBrowserLaunchSession({
      deviceId: "browser_revoked",
      deviceName: "Navegador",
    });
    const consumed = consumeBrowserLaunchSession(created.activationId);
    assert.ok(consumed);
    revokeSession(consumed!.authSessionId);
    const app = appWithSetup();
    const res = await app.request("/v1/setup/status", {
      headers: {
        Cookie: `${BROWSER_AUTH_COOKIE}=${encodeURIComponent(consumed!.cookieToken)}`,
      },
    });
    assert.equal(res.status, 401);
  });

  it("C: browser AuthSession remote peer → no local setup privilege", async () => {
    const { requireLocalProductSetup } = await import(
      "../../src/http/owner-auth.ts"
    );
    const cookie = mintBrowserCookie();
    const app = new Hono();
    app.get("/probe", (c) => {
      const gated = requireLocalProductSetup(c, HUB, {
        peerIsLoopback: false,
      });
      if (gated instanceof Response) return gated;
      return c.json({ ok: true });
    });
    const res = await app.request("/probe", {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: { code: string } };
    assert.equal(body.error?.code, "localhost_only");
  });

  it("D: install_compat owner local → PASS", async () => {
    const app = appWithSetup();
    const res = await app.request("/v1/setup/status", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
  });

  it("E: remote HUB_TOKEN → DENIED", async () => {
    const { requireLocalProductSetup } = await import(
      "../../src/http/owner-auth.ts"
    );
    const app = new Hono();
    app.get("/probe", (c) => {
      // Simulate authenticate seeing non-loopback install_compat as null
      // via requireLocalProductSetup peerIsLoopback false first.
      const gated = requireLocalProductSetup(c, HUB, {
        peerIsLoopback: false,
      });
      if (gated instanceof Response) return gated;
      return c.json({ ok: true });
    });
    const res = await app.request("/probe", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: { code: string } };
    assert.equal(body.error?.code, "localhost_only");
  });

  it("READY without key surfaces LLM_REQUIRED for browser", async () => {
    replaceSetupStateForTests({
      state: SetupStates.READY,
      installationReady: true,
      llmConfigured: true,
      verified: true,
      onboardingCompleted: true,
      llmProvider: "anthropic",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    delete process.env.ANTHROPIC_API_KEY;
    const app = appWithSetup();
    const cookie = mintBrowserCookie();
    const res = await app.request("/v1/setup/status", {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      state: string;
      llmConfigured: boolean;
      onboardingCompleted: boolean;
    };
    assert.equal(body.llmConfigured, false);
    assert.equal(body.onboardingCompleted, false);
    assert.equal(body.state, SetupStates.LLM_REQUIRED);
  });

  it("browser may POST /v1/setup/transition locally", async () => {
    replaceSetupStateForTests({
      state: SetupStates.AGENT_READY,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const app = appWithSetup();
    const cookie = mintBrowserCookie();
    const res = await app.request("/v1/setup/transition", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state: SetupStates.ONBOARDING }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { state: string };
    assert.equal(body.state, SetupStates.ONBOARDING);
  });
});
