/**
 * Smoke: artefactos empaquetados, Hub → Agent MCP initialize + tools/list,
 * filesystem.read, shutdown. Sin Anthropic ni HTTP.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pack } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
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
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, pid: child.pid });
    });
  });
}

function fail(message, extra) {
  process.stderr.write(`${message}\n`);
  if (extra) process.stderr.write(extra + "\n");
  process.exit(1);
}

await pack();

const gatewayEntry = path.join(repoRoot, "dist/gateway/gateway.cjs");
const hubAliasEntry = path.join(repoRoot, "dist/hub/hub.cjs");
const nodeEntry = path.join(repoRoot, "dist/node/node.cjs");
const agentAliasEntry = path.join(repoRoot, "dist/agent/agent.cjs");
const cwd = await mkdtemp(path.join(tmpdir(), "pa-pkg-cwd "));

const handshakeEntry = existsSync(gatewayEntry) ? gatewayEntry : hubAliasEntry;
const handshake = await run(process.execPath, [handshakeEntry], {
  cwd,
  env: {
    ...process.env,
    HUB_HANDSHAKE_ONLY: "1",
  },
});

if (
  handshake.stdout.includes("[hub]") ||
  handshake.stdout.includes("[agent]") ||
  handshake.stdout.includes("[gateway]") ||
  handshake.stdout.includes("[node]")
) {
  fail("stdout del Gateway empaquetado contiene logs (deben ir a stderr)", handshake.stdout);
}
if (handshake.code !== 0) {
  fail("handshake empaquetado falló", handshake.stderr);
}
if (
  !handshake.stderr.includes("[node] READY") &&
  !handshake.stderr.includes("Node READY") &&
  !handshake.stderr.includes("Agent READY")
) {
  fail("no hubo Node READY", handshake.stderr);
}
if (!handshake.stderr.includes("HUB_HANDSHAKE_ONLY")) {
  fail("no hubo handshake OK", handshake.stderr);
}
if (
  !handshake.stderr.includes("[gateway] READY") &&
  !handshake.stderr.includes("HUB_HANDSHAKE_ONLY: handshake OK")
) {
  fail("no hubo marker de handshake Gateway", handshake.stderr);
}

const pidMatch = handshake.stderr.match(/pid=(\d+)/);
if (pidMatch) {
  const nodePid = Number(pidMatch[1]);
  try {
    process.kill(nodePid, 0);
    fail(`Node pid ${nodePid} sigue vivo tras shutdown`);
  } catch {
    /* expected: ESRCH */
  }
}

const sdkRoot = path.join(
  repoRoot,
  "gateway/node_modules/@modelcontextprotocol/sdk",
);
const { Client } = await import(
  pathToFileURL(path.join(sdkRoot, "dist/esm/client/index.js")).href
);
const { StdioClientTransport } = await import(
  pathToFileURL(path.join(sdkRoot, "dist/esm/client/stdio.js")).href
);

const root = await mkdtemp(path.join(tmpdir(), "pa-pkg-fs "));
await writeFile(path.join(root, "nota.txt"), "packaged-ok", "utf8");

const mcpEntry = existsSync(nodeEntry) ? nodeEntry : agentAliasEntry;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  cwd,
  env: {
    ...process.env,
    AGENT_FILESYSTEM_ROOT: root,
  },
  stderr: "pipe",
});
const client = new Client({ name: "smoke-package", version: "0.0.0" });
await client.connect(transport);
const listed = await client.listTools();
const names = listed.tools.map((t) => t.name);
for (const required of [
  "agent.echo",
  "filesystem.read",
  "filesystem.list",
  "filesystem.write",
  "process.execute",
  "math.add",
  "math.subtract",
  "system.info",
  "diagnostics.ping",
  "customer.demo",
  "office.excel.read",
  "office.excel.write",
]) {
  if (!names.includes(required)) {
    fail(`tools/list no incluye ${required}: ${names.join(",")}`);
  }
}

const read = await client.callTool({
  name: "filesystem.read",
  arguments: {
    requestId: "smoke_read",
    context: { conversationId: "c_smoke" },
    input: { path: "nota.txt" },
  },
});
const text = read.content?.[0]?.text ?? "";
if (!text.includes("packaged-ok")) {
  fail("filesystem.read empaquetado no devolvió el contenido", text);
}

await client.close();

process.stderr.write("[smoke:package] OK (handshake + tools/list + filesystem.read)\n");
