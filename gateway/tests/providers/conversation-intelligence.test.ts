import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("conversation intelligence store", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-conv-intel-"));
    prevHome = process.env.PERSONAL_AGENT_DATA_DIR;
    process.env.PERSONAL_AGENT_DATA_DIR = tmp;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
    else process.env.PERSONAL_AGENT_DATA_DIR = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("persists and clears per-conversation override", async () => {
    const mod = await import(
      "../../src/providers/conversation-intelligence.ts"
    );
    assert.equal(mod.getConversationIntelligenceConnectionId("c1"), null);
    mod.setConversationIntelligenceConnectionId("c1", "conn_cloud");
    assert.equal(
      mod.getConversationIntelligenceConnectionId("c1"),
      "conn_cloud",
    );
    mod.setConversationIntelligenceConnectionId("c1", null);
    assert.equal(mod.getConversationIntelligenceConnectionId("c1"), null);
  });
});
