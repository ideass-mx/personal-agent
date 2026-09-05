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

function requestBrowserLaunchUrl(port, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      deviceId: `browser_${crypto.randomUUID()}`,
      deviceName: "Navegador",
    });
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/host/browser-sessions",
        method: "POST",
        timeout: 4000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode === 200 && json.ok === true && json.launchUrl) {
              resolve(json.launchUrl);
              return;
            }
          } catch {
            /* handled below */
          }
          reject(new Error("browser_launch_url_failed"));
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("browser_launch_url_timeout"));
    });
    req.write(payload);
    req.end();
  });
}

module.exports = {
  waitForHealth,
  requestBrowserLaunchUrl,
};
