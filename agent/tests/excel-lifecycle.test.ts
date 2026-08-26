import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import {
  isExcelComShuttingDown,
  resetExcelComLockForTests,
  shutdownExcelCom,
  withExcelComLock,
} from "../src/tools/excel-com-lock.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  resetExcelComLockForTests();
});

const holdTool: AgentTool = {
  name: "office.excel.read",
  description: "test hold",
  inputSchema: { type: "object", properties: {} },
  executionMode: "automatic",
  async execute() {
    await withExcelComLock(async () => {
      await delay(80);
    });
    return { ok: true, content: { held: true } };
  },
};

describe("13D.2 Excel shutdown / disconnect", () => {
  it("shutdown sin operaciones", async () => {
    await shutdownExcelCom(50);
    assert.equal(isExcelComShuttingDown(), true);
  });

  it("shutdown después de un read", async () => {
    await withExcelComLock(async () => 1);
    await shutdownExcelCom(50);
    assert.equal(isExcelComShuttingDown(), true);
  });

  it("shutdown durante un read espera la op activa", async () => {
    let finished = false;
    const active = withExcelComLock(async () => {
      await delay(40);
      finished = true;
    });
    await delay(5);
    await shutdownExcelCom(200);
    await active;
    assert.equal(finished, true);
    assert.equal(isExcelComShuttingDown(), true);
  });

  it("MCP disconnect dispara shutdown Excel", async () => {
    const registry = new ToolRegistry();
    registry.register(holdTool);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "13d2-dc", version: "0.0.0" });
    await client.connect(clientT);
    const pending = client
      .callTool({
        name: "office.excel.read",
        arguments: {
          requestId: "dc",
          context: { conversationId: "c" },
          input: {},
        },
      })
      .catch(() => undefined);
    await delay(15);
    await client.close();
    await serverT.close();
    await pending;
    await delay(30);
    assert.equal(isExcelComShuttingDown(), true);
    await agent.shutdown().catch(() => undefined);
  });
});
