"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  waitForHealth,
  requestBrowserLaunchUrl,
  HOST_BROWSER_UNAVAILABLE,
  HOST_BROWSER_OPEN_FAILED,
  HOST_BROWSER_UNKNOWN_ERROR,
  classifyBrowserOpenError,
} = require("../lib/host-boot.cjs");

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

test("classifyBrowserOpenError maps 0x483 to browser unavailable", () => {
  const state = classifyBrowserOpenError({
    code: 1155,
    message:
      "Failed to open: No hay ninguna aplicación asociada con el archivo especificado para esta operación. (0x483)",
  });
  assert.equal(state.classification, HOST_BROWSER_UNAVAILABLE);
  assert.equal(state.event, "browser_unavailable");
  assert.equal(state.errorCode, "0x483");
  assert.match(state.title, /Tu agente está listo/);
  assert.match(state.message, /No encontramos un navegador web/i);
  assert.doesNotMatch(state.message, /HUB_TOKEN|token|cookie/i);
});

test("classifyBrowserOpenError maps generic failure when browser exists", () => {
  const state = classifyBrowserOpenError(
    new Error("Failed to open browser process"),
  );
  assert.equal(state.classification, HOST_BROWSER_OPEN_FAILED);
  assert.equal(state.event, "browser_open_failed");
  assert.match(state.message, /No pudimos abrir el navegador/i);
});

test("classifyBrowserOpenError maps unknown failures", () => {
  const state = classifyBrowserOpenError("");
  assert.equal(state.classification, HOST_BROWSER_UNKNOWN_ERROR);
  assert.equal(state.event, "browser_open_failed");
  assert.match(state.message, /No pudimos abrir la aplicación Web/i);
});
