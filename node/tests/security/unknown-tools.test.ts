import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../../src/tools/defaults.ts";

describe("7G registry: tools no registradas no se ejecutan", () => {
  it("el registry por defecto no incluye move/shell/admin", () => {
    const registry = createDefaultToolRegistry();
    for (const name of [
      "filesystem.move",
      "filesystem.copy",
      "shell",
      "shell.execute",
      "process.run",
      "admin",
    ]) {
      assert.equal(registry.get(name), undefined, name);
    }
    assert.ok(registry.get("filesystem.search"));
    assert.ok(registry.get("filesystem.read"));
    assert.ok(registry.get("filesystem.write"));
    assert.ok(registry.get("filesystem.list"));
    assert.ok(registry.get("filesystem.delete"));
    assert.ok(registry.get("process.execute"));
  });

  it("MCP callTool a nombre arbitrario no ejecuta y no crea tools", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "audit", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name);
      assert.equal(names.includes("shell"), false);
      assert.equal(names.includes("filesystem.move"), false);

      let failed = false;
      try {
        const result = await client.callTool({
          name: "shell.execute",
          arguments: {
            requestId: "rt_bad",
            context: { conversationId: "c" },
            input: { command: "echo" },
          },
        });
        failed = (result as { isError?: boolean }).isError === true;
      } catch {
        failed = true;
      }
      assert.equal(failed, true);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
