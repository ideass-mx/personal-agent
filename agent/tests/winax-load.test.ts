import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { winaxRequireAnchors } from "../src/tools/winax-load.ts";

describe("13D.2 winax anchors", () => {
  it("usa argv[1] absoluto, no el cwd", () => {
    const cwd = process.cwd();
    const script = path.join(os.tmpdir(), "pa-dist", "agent", "agent.cjs");
    const execPath = path.join(os.tmpdir(), "pa-runtime", "node");
    const anchors = winaxRequireAnchors(script, execPath);
    assert.ok(anchors.includes(path.resolve(script)));
    assert.ok(anchors.includes(path.resolve(execPath)));
    assert.equal(
      anchors.includes(cwd) || anchors.includes(path.resolve(cwd)),
      false,
    );
  });

  it("ignora argv[1] vacío", () => {
    const execPath = "/usr/bin/node";
    const anchors = winaxRequireAnchors("", execPath);
    assert.ok(anchors.includes(path.resolve(execPath)));
    assert.equal(
      anchors.some((a) => a === "" || a === path.resolve("")),
      false,
    );
  });
});
