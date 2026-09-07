import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { childEnvForLocalNode } from "../../src/tools/mcp/stdio.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 33 security & product isolation (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 34 closed; no C/B", () => {
    const doc = read(
      "docs/architecture/phase33-security-product-isolation-audit.md",
    );
    assert.match(doc, /PHASE 33 CLOSED/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 34 CLOSED/);
    assert.match(doc, /PHASE 35 NOT STARTED/);
    assert.match(doc, /\*\*C:\*\* ninguno/);
    assert.match(doc, /\*\*B:\*\* ninguno/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("HTTP: /health público; Workspace/History requieren Bearer", () => {
    const server = read("gateway/src/http/server.ts");
    assert.match(server, /app\.get\("\/health"/);
    assert.doesNotMatch(server, /\/health[\s\S]{0,200}requireAuth|Bearer/);

    const http = read("gateway/src/http/workspace-http.ts");
    assert.match(http, /requireAuth|authenticateHttpRequest/);
    assert.match(http, /\/conversations\/:id\/messages/);
    // Timing-safe compare lives in bearer-auth (shared); workspace uses authenticateHttpRequest.
    const bearer = read("gateway/src/http/bearer-auth.ts");
    assert.match(bearer, /timingSafeEqual/);
    assert.match(bearer, /authenticateHttpRequest/);
  });

  it("WS: auth primero; token timing-safe; no mensajes pre-auth", () => {
    const ws = read("gateway/src/ws/index.ts");
    assert.match(ws, /auth_required/);
    assert.match(ws, /timingSafeEqual/);
    assert.match(ws, /installTokenMatches|tokenMatches/);
    assert.match(ws, /session\.ws\.close\(\)/);
  });

  it("Node env: sin HUB_TOKEN ni ANTHROPIC; MCP stdio sin listen", () => {
    const env = childEnvForLocalNode({
      AGENT_FILESYSTEM_ROOT: "/tmp/x",
      HUB_TOKEN: "secret",
      ANTHROPIC_API_KEY: "sk",
    });
    assert.equal(env.AGENT_FILESYSTEM_ROOT, "/tmp/x");
    assert.equal("HUB_TOKEN" in env, false);
    assert.equal("ANTHROPIC_API_KEY" in env, false);

    const mcp = read("node/src/mcp/server.ts");
    assert.doesNotMatch(mcp, /\.listen\(createServer\(http\.createServer/);
  });

  it("policy deny-by-default; mutating tools confirm; process.execute shell false", () => {
    assert.equal(DEFAULT_TOOL_POLICY["process.execute"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.read"], "automatic");

    const proc = read("node/src/tools/process-execute.ts");
    assert.match(proc, /shell:\s*false/);
  });

  it("system.info no vuelca process.env; package no copia .env", () => {
    const sys = read("node/src/tools/system.ts");
    assert.doesNotMatch(sys, /process\.env/);
    const pack = read("scripts/package.mjs");
    assert.doesNotMatch(pack, /\.env/);
  });

  it("invariantes: sin User/PermissionManager/ownership en código productivo", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /PermissionManager|UserService|ownership/i);
    const tools = read("gateway/src/tools/types.ts");
    assert.doesNotMatch(tools, /workspaceId/);
  });
});
