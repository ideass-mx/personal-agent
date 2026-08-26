import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_FILESYSTEM_ROOT_ENV,
  loadAgentConfig,
  loadNodeConfig,
} from "../src/config.ts";

describe("loadAgentConfig / loadNodeConfig", () => {
  it("sin env no hay root", () => {
    assert.deepEqual(loadAgentConfig({}), {});
    assert.deepEqual(loadNodeConfig({}), {});
  });

  it("lee AGENT_FILESYSTEM_ROOT", () => {
    const env = { [AGENT_FILESYSTEM_ROOT_ENV]: "  /tmp/ws  " };
    assert.deepEqual(loadAgentConfig(env), { filesystem: { root: "/tmp/ws" } });
    assert.deepEqual(loadNodeConfig(env), { filesystem: { root: "/tmp/ws" } });
  });
});
