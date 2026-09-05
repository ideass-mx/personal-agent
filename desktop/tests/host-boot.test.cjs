"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { waitForHealth, requestBrowserLaunchUrl } = require("../lib/host-boot.cjs");

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

test("requestBrowserLaunchUrl returns one-shot local browser URL", async () => {
  const http = require("node:http");
  const server = http.createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/host/browser-sessions");
    assert.equal(req.headers.authorization, `Bearer ${"x".repeat(32)}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        launchUrl: "http://127.0.0.1:8787/v1/host/browser-sessions/abc",
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const url = await requestBrowserLaunchUrl(port, "x".repeat(32));
  assert.equal(
    url,
    "http://127.0.0.1:8787/v1/host/browser-sessions/abc",
  );
  server.close();
});
