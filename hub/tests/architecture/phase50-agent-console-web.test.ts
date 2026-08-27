import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(p);
  }
  return out;
}

describe("PHASE 50 Agent Console Web MVP", () => {
  it("docs and web package exist", () => {
    assert.ok(existsSync(path.join(repoRoot, "web/package.json")));
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "docs/architecture/phase50-agent-console-web-implementation.md",
        ),
      ),
    );
    const doc = read(
      "docs/architecture/phase50-agent-console-web-implementation.md",
    );
    assert.match(doc, /PHASE 50/);
    assert.match(doc, /Agent Console/);
  });

  it("Console does not implement Runtime, MCP, Tool Policy, PermissionManager", () => {
    const files = walkTs(path.join(repoRoot, "web/src"));
    assert.ok(files.length > 0);
    const joined = files.map((f) => readFileSync(f, "utf8")).join("\n");
    assert.doesNotMatch(joined, /ConfirmationWaiter/);
    assert.doesNotMatch(joined, /PermissionManager/);
    assert.doesNotMatch(joined, /ToolPolicy|toolPolicy/);
    assert.doesNotMatch(joined, /from ["'].*mcp/i);
    assert.doesNotMatch(joined, /AgentRuntime/);
    assert.doesNotMatch(joined, /resolveSafePath/);
    assert.doesNotMatch(joined, /child_process|node:fs|better-sqlite3/);
  });

  it("does not expose secrets patterns in UI sources", () => {
    const files = walkTs(path.join(repoRoot, "web/src"));
    const joined = files.map((f) => readFileSync(f, "utf8")).join("\n");
    assert.doesNotMatch(
      joined,
      /ANTHROPIC_API_KEY\s*[:=]\s*["'][^"']+["']/,
    );
    assert.match(joined, /maskToken|sanitizeDiagnostics|sanitizeInputSummary/);
  });

  it("reuses protocol frames; no new WS types invented in client", () => {
    const sock = read("web/src/websocket/HubSocket.ts");
    assert.match(sock, /user_message/);
    assert.match(sock, /confirm_response/);
    assert.match(sock, /confirm_request/);
    assert.match(sock, /assistant_chunk/);
    assert.doesNotMatch(sock, /tool_progress/);
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /PHASE 50/);
  });

  it("Hub serves Agent Console static (R-49-01); Host remains authority", () => {
    const server = read("hub/src/http/server.ts");
    assert.match(server, /serveStatic|Agent Console static|resolveConsoleStaticRoot/);
    assert.match(server, /AGENT_CONSOLE_DEV_ORIGIN/);
    assert.doesNotMatch(server, /Access-Control-Allow-Origin", "\*"/);
    assert.ok(
      existsSync(path.join(repoRoot, "hub/src/http/console-static.ts")),
    );
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 50|phase50-agent-console/);
  });

  it("desktop/ preserved; Electron not full Console", () => {
    assert.ok(existsSync(path.join(repoRoot, "desktop/package.json")));
    const doc = read(
      "docs/architecture/phase50-agent-console-web-implementation.md",
    );
    assert.match(doc, /desktop\//);
    assert.match(doc, /no.*Electron full|tray|no eliminar desktop/i);
  });
});
