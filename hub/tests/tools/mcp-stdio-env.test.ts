import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { childEnvForLocalNode } from "../../src/tools/mcp-stdio.ts";

describe("childEnvForLocalNode", () => {
  it("pasa PATH y AGENT_FILESYSTEM_ROOT; rechaza secretos en extra", () => {
    const env = childEnvForLocalNode({
      AGENT_FILESYSTEM_ROOT: "/tmp/ws",
      ANTHROPIC_API_KEY: "sk-should-not-pass",
      HUB_TOKEN: "hub-should-not-pass",
    });
    assert.equal(env.AGENT_FILESYSTEM_ROOT, "/tmp/ws");
    assert.equal("ANTHROPIC_API_KEY" in env, false);
    assert.equal("HUB_TOKEN" in env, false);
    const path = env.PATH ?? env.Path;
    assert.equal(typeof path, "string");
    assert.ok((path ?? "").length > 0);
  });

  it("no copia HUB_TOKEN ni ANTHROPIC_API_KEY desde process.env", () => {
    const env = childEnvForLocalNode();
    assert.equal("HUB_TOKEN" in env, false);
    assert.equal("ANTHROPIC_API_KEY" in env, false);
  });
});
