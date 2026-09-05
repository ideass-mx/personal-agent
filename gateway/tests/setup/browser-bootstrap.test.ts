import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-browser-bootstrap-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-browser-bootstrap";
process.env.HUB_TOKEN = "e".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "55555555-5555-4555-8555-555555555555";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { mountBrowserBootstrapHttp } = await import(
  "../../src/http/browser-bootstrap-http.ts"
);
const {
  authenticateHttpRequest,
  cookieToken,
} = await import("../../src/http/bearer-auth.ts");
const {
  BROWSER_AUTH_COOKIE,
  verifyBrowserCookieSession,
} = await import("../../src/http/browser-session.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("browser bootstrap auth", () => {
  it("creates one-shot browser launch URL and authenticates setup via cookie", async () => {
    const app = new Hono();
    mountBrowserBootstrapHttp(app, { hubToken: HUB });

    const created = await app.request("/v1/host/browser-sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
        host: "127.0.0.1:8787",
      },
      body: JSON.stringify({ deviceName: "Browser" }),
    });
    assert.equal(created.status, 200);
    const createJson = (await created.json()) as {
      ok: true;
      launchUrl: string;
      deviceId: string;
      deviceName: string;
    };
    assert.match(createJson.launchUrl, /\/v1\/host\/browser-sessions\//);

    const activatePath = new URL(createJson.launchUrl).pathname;
    const activated = await app.request(activatePath, {
      headers: { host: "127.0.0.1:8787" },
    });
    assert.equal(activated.status, 200);
    const setCookie = activated.headers.get("set-cookie") || "";
    assert.match(setCookie, /pa_browser_auth=/);
    const browserCookie = setCookie.split(";")[0];
    const html = await activated.text();
    assert.match(html, /pa_console_session_v1/);
    assert.doesNotMatch(html, new RegExp(HUB, "i"));

    const extracted = cookieToken(browserCookie, BROWSER_AUTH_COOKIE);
    assert.ok(extracted);
    assert.deepEqual(verifyBrowserCookieSession(extracted), {
      deviceId: createJson.deviceId,
      deviceName: createJson.deviceName,
    });
    const principal = authenticateHttpRequest(
      {
        req: {
          header(name: string) {
            if (name === "Cookie" || name.toLowerCase() === "cookie") {
              return browserCookie;
            }
            return undefined;
          },
        },
      } as unknown as Parameters<typeof authenticateHttpRequest>[0],
      HUB,
    );
    assert.deepEqual(principal, { kind: "install" });
  });

  it("rejects non-loopback activation host", async () => {
    const app = new Hono();
    mountBrowserBootstrapHttp(app, { hubToken: HUB });
    const created = await app.request("/v1/host/browser-sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const createJson = (await created.json()) as { launchUrl: string };
    const activatePath = new URL(createJson.launchUrl).pathname;
    const denied = await app.request(activatePath, {
      headers: { host: "example.com" },
    });
    assert.equal(denied.status, 403);
  });
});

