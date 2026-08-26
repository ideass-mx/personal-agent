import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../agent/src/lifecycle.ts";
import { AGENT_FILESYSTEM_ROOT_ENV } from "../../../agent/src/config.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp-executor.ts";
import { connectAgentStdioClient } from "../../src/tools/mcp-stdio.ts";
import { REMOTE_TOOL_ERROR_CODE } from "../../src/tools/remote.ts";
import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";

describe("8D MCP regresión Hub", () => {
  it("tool desconocida falla; JSON inválido fail-closed sin retry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-unk-"));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, {
      config: { filesystem: { root } },
    });
    const client = new Client({ name: "hub-unk", version: "0.0.0" });
    await client.connect(clientT);
    try {
      let unknownFailed = false;
      try {
        const unknown = await client.callTool({
          name: "process.run",
          arguments: {
            requestId: "rt_bad",
            context: { conversationId: "c" },
            input: {},
          },
        });
        unknownFailed = (unknown as { isError?: boolean }).isError === true;
      } catch {
        unknownFailed = true;
      }
      assert.equal(unknownFailed, true);

      const fake = createMcpRemoteExecutor({
        async callTool() {
          return { content: [{ type: "text", text: "no-json" }] };
        },
      } as unknown as McpClient);
      const result = await fake.execute({
        requestId: "rt_j",
        toolName: "agent.echo",
        input: { text: "x" },
        context: { conversationId: "c" },
      });
      assert.equal(result.result.ok, false);
      if (!result.result.ok) {
        assert.equal(result.result.error.code, REMOTE_TOOL_ERROR_CODE);
      }
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("stdio: listTools y desconexión sin fallback in-process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-stdio-"));
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v;
    }
    env[AGENT_FILESYSTEM_ROOT_ENV] = root;

    const { client, close } = await connectAgentStdioClient({ env });
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name);
      assert.ok(names.includes("filesystem.read"));
      assert.ok(names.includes("process.execute"));
    } finally {
      await close();
    }

    const dead = createMcpRemoteExecutor(client);
    const after = await dead.execute({
      requestId: "rt_dead",
      toolName: "agent.echo",
      input: { text: "x" },
      context: { conversationId: "c" },
    });
    assert.equal(after.result.ok, false);
  });
});
