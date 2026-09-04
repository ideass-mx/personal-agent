"use strict";

/**
 * Desktop host boot: start Gateway without remote-network gate, wait /health, open Web UI.
 */
const http = require("node:http");
const crypto = require("node:crypto");

function waitForHealth(port, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/health", timeout: 2000 },
        (res) => {
          let body = "";
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              if (res.statusCode === 200 && json.ok === true) {
                resolve(json);
                return;
              }
            } catch {
              /* retry */
            }
            if (Date.now() - started > timeoutMs) {
              reject(new Error("health_timeout"));
              return;
            }
            setTimeout(tick, 400);
          });
        },
      );
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("health_timeout"));
          return;
        }
        setTimeout(tick, 400);
      });
    };
    tick();
  });
}

/**
 * Inject install session into Agent Console (same-origin) without showing the token in UI.
 */
async function injectConsoleSession(webContents, token) {
  const needs = await webContents.executeJavaScript(
    `!sessionStorage.getItem("pa_console_session_v1")`,
  );
  if (!needs) return false;
  const payload = JSON.stringify({
    httpBase: "",
    token,
    deviceId: crypto.randomUUID(),
    deviceName: "Escritorio",
  });
  await webContents.executeJavaScript(
    `sessionStorage.setItem("pa_console_session_v1", ${JSON.stringify(payload)});
     sessionStorage.setItem("pa_host_bootstrap", "1");
     true;`,
  );
  return true;
}

module.exports = {
  waitForHealth,
  injectConsoleSession,
};
