"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { waitForHealth, injectConsoleSession } = require("../lib/host-boot.cjs");

test("waitForHealth resolves when /health ok", async () => {
  const http = require("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, agentReady: true }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const health = await waitForHealth(port, 5000);
  assert.equal(health.ok, true);
  server.close();
});

test("injectConsoleSession sets session when missing", async () => {
  const store = new Map();
  const webContents = {
    executeJavaScript: async (code) => {
      if (code.includes("!sessionStorage.getItem")) {
        return !store.has("pa_console_session_v1");
      }
      if (code.includes("sessionStorage.setItem")) {
        const m = /sessionStorage\.setItem\("pa_console_session_v1", ("(?:\\.|[^"])*")\)/.exec(
          code,
        );
        if (m) {
          store.set("pa_console_session_v1", JSON.parse(JSON.parse(m[1])));
        }
        store.set("pa_host_bootstrap", "1");
        return true;
      }
      return null;
    },
  };
  const did = await injectConsoleSession(webContents, "x".repeat(32));
  assert.equal(did, true);
  const session = store.get("pa_console_session_v1");
  assert.equal(session.token, "x".repeat(32));
  assert.equal(session.httpBase, "");
  const again = await injectConsoleSession(webContents, "y".repeat(32));
  assert.equal(again, false);
});
