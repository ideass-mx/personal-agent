"use strict";

/**
 * Desktop host boot: start Gateway without remote-network gate, wait /health, open Web UI.
 */
const http = require("node:http");
const crypto = require("node:crypto");

const HOST_BROWSER_UNAVAILABLE = "HOST_BROWSER_UNAVAILABLE";
const HOST_BROWSER_OPEN_FAILED = "HOST_BROWSER_OPEN_FAILED";
const HOST_BROWSER_UNKNOWN_ERROR = "HOST_BROWSER_UNKNOWN_ERROR";

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

function normalizeErrorCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `0x${value.toString(16).toUpperCase()}`;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return `0x${trimmed.slice(2).toUpperCase()}`;
  }
  if (/^\d+$/.test(trimmed)) {
    return `0x${Number(trimmed).toString(16).toUpperCase()}`;
  }
  return null;
}

function extractBrowserErrorCode(err) {
  if (!err || typeof err !== "object") return null;
  const direct =
    normalizeErrorCode(err.code) ||
    normalizeErrorCode(err.errno) ||
    normalizeErrorCode(err.status);
  if (direct) return direct;
  const message =
    err instanceof Error ? err.message : typeof err.message === "string" ? err.message : "";
  const hex = /\b0x([0-9a-f]+)\b/i.exec(message);
  if (hex) return `0x${hex[1].toUpperCase()}`;
  return null;
}

function classifyBrowserOpenError(err) {
  const error =
    err instanceof Error
      ? err
      : new Error(
          err && typeof err === "object" && typeof err.message === "string"
            ? err.message
            : String(err || "unknown_error"),
        );
  if (err && typeof err === "object") {
    if (err.code !== undefined) error.code = err.code;
    if (err.errno !== undefined) error.errno = err.errno;
    if (err.status !== undefined) error.status = err.status;
  }
  const errorCode = extractBrowserErrorCode(error);
  const message = error.message || "unknown_error";
  const unavailableByCode = errorCode === "0x483";
  const unavailableByText =
    /no application is associated/i.test(message) ||
    /ninguna aplicaci[oó]n asociada/i.test(message);
  if (unavailableByCode || unavailableByText) {
    return {
      classification: HOST_BROWSER_UNAVAILABLE,
      event: "browser_unavailable",
      errorCode,
      error: message,
      title: "Tu agente está listo",
      message:
        "No encontramos un navegador web en esta computadora. Para continuar, instala un navegador como Microsoft Edge, Google Chrome o Mozilla Firefox y vuelve a intentarlo.",
      details:
        "El agente está funcionando correctamente, pero Windows no tiene una aplicación asociada para abrir enlaces web.",
    };
  }
  if (message && message !== "unknown_error") {
    return {
      classification: HOST_BROWSER_OPEN_FAILED,
      event: "browser_open_failed",
      errorCode,
      error: message,
      title: "Tu agente está listo",
      message:
        "No pudimos abrir el navegador. Comprueba que tu navegador predeterminado funcione correctamente y vuelve a intentarlo.",
      details:
        "El agente está funcionando correctamente, pero Windows no pudo abrir el navegador predeterminado.",
    };
  }
  return {
    classification: HOST_BROWSER_UNKNOWN_ERROR,
    event: "browser_open_failed",
    errorCode,
    error: "unknown_error",
    title: "Tu agente está listo",
    message:
      "No pudimos abrir la aplicación Web. Puedes volver a intentarlo o consultar los detalles del problema.",
    details:
      "El agente está funcionando correctamente, pero ocurrió un error inesperado al abrir la aplicación Web.",
  };
}

module.exports = {
  HOST_BROWSER_OPEN_FAILED,
  HOST_BROWSER_UNAVAILABLE,
  HOST_BROWSER_UNKNOWN_ERROR,
  classifyBrowserOpenError,
  extractBrowserErrorCode,
  waitForHealth,
  requestBrowserLaunchUrl,
};
