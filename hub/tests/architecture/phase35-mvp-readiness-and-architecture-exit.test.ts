import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

describe("PHASE 35 MVP readiness / architecture exit (audit)", () => {
  it("docs: CLOSED; MVP-READY WITH DEBT; PHASE 36 closed; no productive code", () => {
    const doc = read(
      "docs/architecture/phase35-mvp-readiness-and-architecture-exit.md",
    );
    assert.match(doc, /PHASE 35 CLOSED/);
    assert.match(doc, /MVP-READY WITH DEBT/);
    assert.match(doc, /PHASE 36 CLOSED/);
    assert.match(doc, /Código productivo PHASE 35: \*\*NONE\*\*|Código productivo: \*\*NONE\*\*/);
    assert.match(doc, /\*\*B:\*\* ninguno/);
    assert.match(doc, /\*\*C:\*\* ninguno/);
    assert.match(doc, /PHASE 37 Hub-first|NO iniciar PHASE 37/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("exit criteria A–G documented as PASS", () => {
    const doc = read(
      "docs/architecture/phase35-mvp-readiness-and-architecture-exit.md",
    );
    assert.match(doc, /A Identity[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /B Runtime[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /C Security[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /D Persistence[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /E Lifecycle[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /F Product flow[\s\S]*?\*\*PASS\*\*/);
    assert.match(doc, /G Packaging[\s\S]*?\*\*PASS\*\*/);
  });

  it("Runtime still isolated from Workspace/Android/User types", () => {
    const src = read("hub/src/agent/runtime.ts");
    assert.doesNotMatch(src, /workspace/i);
    assert.doesNotMatch(src, /android/i);
    assert.doesNotMatch(src, /PermissionManager|AgentRegistry|NodeRegistry|UserService/);
  });

  it("startup still fail-closed before READY", () => {
    const src = read("hub/src/index.ts");
    assert.match(src, /attachLocalAgent/);
    assert.match(src, /process\.exit\(1\)/);
    assert.match(src, /\[hub\] READY/);
  });

  it("History API and packaging smoke still exist", () => {
    assert.match(
      read("hub/src/memory/history.ts"),
      /listConversationMessages/,
    );
    assert.ok(existsSync(path.join(repoRoot, "scripts/smoke-package.mjs")));
    assert.ok(existsSync(path.join(repoRoot, "scripts/package.mjs")));
  });

  it("must-not-build future platform called out", () => {
    const doc = read(
      "docs/architecture/phase35-mvp-readiness-and-architecture-exit.md",
    );
    assert.match(doc, /What we must NOT build yet/);
    assert.match(doc, /User \/ ACL/);
    assert.match(doc, /AgentRegistry/);
    assert.match(doc, /A2A/);
  });
});
