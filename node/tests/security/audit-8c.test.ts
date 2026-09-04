import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../../src/tools/defaults.ts";
import { PROCESS_EXECUTE } from "../../src/tools/process-execute.ts";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("8C Agent: MCP, stdio, registry", () => {
  it("src no abre HTTP/WS ni escribe logs en stdout", () => {
    for (const file of walkTs(path.join(agentRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /createServer\(|listen\(/, file);
      assert.doesNotMatch(text, /from ["']ws["']/, file);
      assert.doesNotMatch(text, /from ["']node:http["']/, file);
      assert.doesNotMatch(text, /console\.log/, file);
      assert.doesNotMatch(text, /process\.stdout\.write/, file);
    }
  });

  it("entry usa stderr para logs", () => {
    const src = readFileSync(path.join(agentRoot, "src/index.ts"), "utf8");
    assert.match(src, /process\.stderr\.write/);
    assert.match(src, /StdioServerTransport/);
  });

  it("tools/list coincide con el registry; tool desconocida no ejecuta", async () => {
    const registry = createDefaultToolRegistry();
    const expected = new Set(registry.list().map((t) => t.name));
    assert.ok(expected.has("filesystem.read"));
    assert.ok(expected.has("filesystem.write"));
    assert.ok(expected.has("filesystem.list"));
    assert.ok(expected.has("process.execute"));
    assert.equal(expected.has("shell.execute"), false);

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "8c", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      const names = new Set(listed.tools.map((t) => t.name));
      assert.deepEqual(names, expected);

      let failed = false;
      try {
        const result = await client.callTool({
          name: "process.run",
          arguments: {
            requestId: "rt_x",
            context: { conversationId: "c" },
            input: { command: "true" },
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

  it("process.execute captura stdout del hijo (no stdout MCP)", async () => {
    const tool = createDefaultToolRegistry().get(PROCESS_EXECUTE.name);
    assert.ok(tool);
    const result = await tool.execute(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('CHILD_OUT'); process.stderr.write('CHILD_ERR')"],
      },
      { conversationId: "c" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const c = result.content as { stdout: string; stderr: string };
    assert.equal(c.stdout, "CHILD_OUT");
    assert.equal(c.stderr, "CHILD_ERR");
  });
});
