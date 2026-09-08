import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homedir } from "node:os";
import path from "node:path";
import {
  expandUserPathShortcuts,
  unwrapToolBusinessInput,
} from "../src/tools/fs-user-paths.ts";

describe("fs-user-paths", () => {
  it("expande Desktop/Documents/~", () => {
    assert.equal(
      expandUserPathShortcuts("Desktop"),
      path.join(homedir(), "Desktop"),
    );
    assert.equal(
      expandUserPathShortcuts("Documents"),
      path.join(homedir(), "Documents"),
    );
    assert.equal(expandUserPathShortcuts("~"), homedir());
    assert.equal(
      expandUserPathShortcuts("~/Reports"),
      path.join(homedir(), "Reports"),
    );
  });

  it("desenvuelve envelope MCP anidado por error", () => {
    const nested = {
      requestId: "rt_1",
      context: { conversationId: "c" },
      input: { path: "C:\\Users" },
    };
    assert.deepEqual(unwrapToolBusinessInput(nested), { path: "C:\\Users" });
    assert.deepEqual(unwrapToolBusinessInput({ path: "C:\\Users" }), {
      path: "C:\\Users",
    });
  });
});
