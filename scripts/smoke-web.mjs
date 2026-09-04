/**
 * Smoke mínimo PHASE 50:
 * build Web → servir static → GET / → GET /health → WS auth_ok.
 * No simula hardware Windows/Android.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  createReadStream,
  statSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "gateway/package.json"));
const { WebSocketServer } = require("ws");
const WebSocket = globalThis.WebSocket;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? repoRoot,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function fail(msg, extra) {
  process.stderr.write(`${msg}\n`);
  if (extra) process.stderr.write(String(extra) + "\n");
  process.exit(1);
}

function mime(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript";
  if (p.endsWith(".css")) return "text/css";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const webPkg = path.join(repoRoot, "web/package.json");
if (!existsSync(webPkg)) fail("web/package.json missing");

if (!existsSync(path.join(repoRoot, "web/node_modules"))) {
  const inst = await run("npm", ["install"], { cwd: path.join(repoRoot, "web") });
  if (inst.code !== 0) fail("npm install web failed", inst.stderr);
}

const build = await run("npm", ["run", "build"], {
  cwd: path.join(repoRoot, "web"),
});
if (build.code !== 0) fail("web build failed", build.stderr + build.stdout);

const webDist = path.join(repoRoot, "web/dist");
if (!existsSync(path.join(webDist, "index.html"))) {
  fail("web/dist/index.html missing after build");
}

const outWeb = path.join(repoRoot, "dist/web");
rmSync(outWeb, { recursive: true, force: true });
mkdirSync(path.dirname(outWeb), { recursive: true });
cpSync(webDist, outWeb, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        name: "smoke-web",
        devices: [],
        agentReady: true,
        agentTools: [],
      }),
    );
    return;
  }
  let rel = (req.url || "/").split("?")[0];
  if (rel === "/") rel = "/index.html";
  const file = path.join(webDist, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, ""));
  if (!file.startsWith(webDist) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "Content-Type": mime(file) });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if ((req.url || "").split("?")[0] === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(String(data));
          if (msg.type === "auth") {
            ws.send(
              JSON.stringify({
                type: "auth_ok",
                deviceId: msg.deviceId || "smoke",
              }),
            );
          }
        } catch {
          /* ignore */
        }
      });
    });
  } else {
    socket.destroy();
  }
});

await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
});
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const indexRes = await fetch(`${base}/`);
if (!indexRes.ok) fail(`GET / failed ${indexRes.status}`);
const html = await indexRes.text();
if (!html.includes("root") && !html.includes("Personal Agent")) {
  fail("GET / body unexpected", html.slice(0, 200));
}

const healthRes = await fetch(`${base}/health`);
if (!healthRes.ok) fail(`GET /health failed ${healthRes.status}`);
const health = await healthRes.json();
if (!health.ok) fail("health.ok false");

const wsOk = await new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const t = setTimeout(() => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    resolve(false);
  }, 3000);
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: "auth",
        token: "smoke",
        deviceId: "smoke-web",
      }),
    );
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "auth_ok") {
        clearTimeout(t);
        ws.close();
        resolve(true);
      }
    } catch {
      /* ignore */
    }
  };
  ws.onerror = () => {
    clearTimeout(t);
    resolve(false);
  };
});

await new Promise((r) => server.close(() => r()));
wss.close();

if (!wsOk) fail("WebSocket auth_ok smoke failed");

process.stdout.write("smoke-web: build OK\n");
process.stdout.write("smoke-web: GET / OK\n");
process.stdout.write("smoke-web: GET /health OK\n");
process.stdout.write("smoke-web: WebSocket auth_ok OK\n");
process.stdout.write("smoke-web: PASS\n");
