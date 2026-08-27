"use strict";

const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Supervisa el proceso Gateway existente. No es un Runtime.
 */
function resolveGatewayLaunch(productRoot) {
  const candidates = [
    path.join(productRoot, "gateway", "hub.cjs"),
    path.join(productRoot, "hub", "hub.cjs"),
  ];
  const hubCjs = candidates.find((p) => fs.existsSync(p));
  if (!hubCjs) {
    return {
      hubCjs: candidates[0],
      hubDir: path.join(productRoot, "gateway"),
      nodeCmd: "node",
      exists: false,
    };
  }
  const hubDir = path.dirname(hubCjs);
  const nodeRuntimeWin = path.join(productRoot, "runtime", "node", "node.exe");
  const nodeRuntimeUnix = path.join(productRoot, "runtime", "node", "bin", "node");
  const nodeCmd = fs.existsSync(nodeRuntimeWin)
    ? nodeRuntimeWin
    : fs.existsSync(nodeRuntimeUnix)
      ? nodeRuntimeUnix
      : "node";
  return { hubCjs, hubDir, nodeCmd, exists: true };
}

function createAgentSupervisor({
  productRoot,
  getEnv,
  onLog,
  onState,
}) {
  let child = null;
  let bootReady = false;
  let lastError = null;
  let logStream = null;

  function isRunning() {
    return Boolean(child && child.exitCode === null && !child.killed);
  }

  function appendLog(line) {
    onLog?.(line);
    try {
      if (!logStream) {
        const { paths, ensureDirs } = require("./config.cjs");
        ensureDirs();
        const file = path.join(paths().logsDir, "gateway.log");
        logStream = fs.createWriteStream(file, { flags: "a" });
      }
      logStream.write(line);
    } catch {
      /* ignore */
    }
  }

  async function probeHealth(port) {
    return new Promise((resolve) => {
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
              resolve({
                ok: res.statusCode === 200 && json.ok === true,
                agentReady: Boolean(json.agentReady),
                agentTools: Array.isArray(json.agentTools)
                  ? json.agentTools.length
                  : 0,
                devices: Array.isArray(json.devices) ? json.devices : [],
              });
            } catch {
              resolve({ ok: false, agentReady: false, agentTools: 0, devices: [] });
            }
          });
        },
      );
      req.on("error", () =>
        resolve({ ok: false, agentReady: false, agentTools: 0, devices: [] }),
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, agentReady: false, agentTools: 0, devices: [] });
      });
    });
  }

  async function start() {
    if (isRunning()) return { ok: true, already: true };
    const launch = resolveGatewayLaunch(productRoot);
    if (!launch.exists) {
      lastError = "gateway_missing";
      onState?.();
      return { ok: false, error: lastError };
    }
    bootReady = false;
    lastError = null;
    const env = getEnv();
    child = spawn(launch.nodeCmd, [launch.hubCjs], {
      cwd: launch.hubDir,
      env: {
        ...process.env,
        ...env,
        // SQLite bajo AppData si se define PERSONAL_AGENT_DB
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.stderr.on("data", (buf) => {
      const text = buf.toString("utf8");
      appendLog(text);
      if (text.includes("[hub] READY") || text.includes("Agent READY")) {
        bootReady = true;
        onState?.();
      }
      if (text.includes("fallo al arrancar")) {
        lastError = "boot_failed";
        onState?.();
      }
    });
    child.on("exit", (code) => {
      appendLog(`\n[shell] gateway exit code=${code}\n`);
      bootReady = false;
      if (code && code !== 0) lastError = `exit_${code}`;
      child = null;
      onState?.();
    });
    onState?.();
    return { ok: true };
  }

  async function stop() {
    if (!child) return;
    const proc = child;
    child = null;
    bootReady = false;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      if (proc.exitCode === null) proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    onState?.();
  }

  async function restart() {
    await stop();
    return start();
  }

  function snapshot() {
    return {
      running: isRunning(),
      bootReady,
      lastError,
      pid: child?.pid,
    };
  }

  return {
    start,
    stop,
    restart,
    probeHealth,
    snapshot,
    isRunning,
  };
}

module.exports = {
  createAgentSupervisor,
  resolveGatewayLaunch,
};
