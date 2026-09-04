import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveConsoleStaticRoot } from "../../src/http/console-static.ts";

describe("resolveConsoleStaticRoot", () => {
  it("finds index.html via AGENT_CONSOLE_STATIC", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pa-console-"));
    writeFileSync(path.join(dir, "index.html"), "<html></html>");
    const found = resolveConsoleStaticRoot(
      { AGENT_CONSOLE_STATIC: dir },
      dir,
    );
    assert.equal(found, path.resolve(dir));
  });

  it("returns null when missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pa-console-empty-"));
    mkdirSync(path.join(dir, "empty"), { recursive: true });
    const found = resolveConsoleStaticRoot({}, path.join(dir, "empty"));
    assert.equal(found, null);
  });
});
