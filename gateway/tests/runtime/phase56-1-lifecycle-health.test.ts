/**
 * PHASE 56.1-A — Node lifecycle / dynamic health.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ToolRegistry } from "../../src/tools/registry.ts";
import { attachLocalNode } from "../../src/runtime/attach-node.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import {
  nodeHealthFromStatus,
  NODE_LIFECYCLE_STATUSES,
} from "../../src/runtime/node-lifecycle.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-56-1a-"));
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
process.env.HUB_TOKEN ??= "b".repeat(32);
process.env.PERSONAL_AGENT_DB ??= path.join(tmp, "t.db");
process.env.PERSONAL_AGENT_ID ??= "22222222-2222-4222-8222-222222222222";

describe("PHASE 56.1-A Node lifecycle / health", () => {
  it("nodeHealthFromStatus: READY vs DISCONNECTED", () => {
    assert.ok(NODE_LIFECYCLE_STATUSES.includes("READY"));
    const ready = nodeHealthFromStatus("READY", ["filesystem.read"]);
    assert.equal(ready.agentReady, true);
    assert.equal(ready.nodeStatus, "READY");
    const down = nodeHealthFromStatus("DISCONNECTED", ["filesystem.read"]);
    assert.equal(down.agentReady, false);
    assert.equal(down.nodeStatus, "DISCONNECTED");
  });

  it("LocalNodeHandle READY after attach; shutdown → STOPPING (no crash)", async () => {
    const registry = new ToolRegistry();
    let disconnectCalls = 0;
    const node = await attachLocalNode({
      registry,
      toolPolicy: DEFAULT_TOOL_POLICY,
      onDisconnected: () => {
        disconnectCalls += 1;
      },
    });
    assert.equal(node.status, "READY");
    assert.equal(node.ready, true);
    assert.equal(node.getHealth().agentReady, true);
    assert.ok(node.getHealth().agentTools.includes("filesystem.read"));

    await node.shutdown();
    assert.equal(disconnectCalls, 0, "shutdown normal no es crash");
    assert.equal(node.status, "STOPPING");
    assert.equal(node.ready, false);
    assert.equal(node.getHealth().agentReady, false);
  });

  it("unexpected disconnect → DISCONNECTED; health deja de ser READY; tools fail-closed", async () => {
    const registry = new ToolRegistry();
    let seenStatus: string | undefined;
    const node = await attachLocalNode({
      registry,
      toolPolicy: DEFAULT_TOOL_POLICY,
      onDisconnected: (status) => {
        seenStatus = status;
      },
    });
    assert.equal(node.status, "READY");
    const pid = node.pid;
    assert.ok(typeof pid === "number" && pid > 0);

    process.kill(pid!, "SIGKILL");
    const deadline = Date.now() + 5_000;
    while (node.status === "READY" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.equal(node.status, "DISCONNECTED");
    assert.equal(node.ready, false);
    assert.equal(node.getHealth().agentReady, false);
    assert.equal(node.getHealth().nodeStatus, "DISCONNECTED");
    assert.equal(seenStatus, "DISCONNECTED");

    const tool = registry.get("filesystem.read");
    assert.ok(tool);
    const result = await tool!.execute(
      { path: "." },
      { conversationId: "c1" },
    );
    assert.equal(result.ok, false);

    await node.shutdown();
  });
});

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
