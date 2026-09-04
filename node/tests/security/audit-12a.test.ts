import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../../src/lifecycle.ts";
import {
  PROCESS_EXECUTE_MAX_OUTPUT_BYTES,
  PROCESS_EXECUTE_MAX_TIMEOUT_MS,
} from "../../src/tools/process-execute.ts";

const agentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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

describe("12A Agent: propiedades de seguridad no cubiertas antes", () => {
  it("tools/list MCP no anuncia executionMode", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "12a", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === "filesystem.write"));
      assert.ok(listed.tools.some((t) => t.name === "process.execute"));
      for (const tool of listed.tools) {
        assert.equal("executionMode" in tool, false, tool.name);
        assert.equal("executionMode" in tool, false, tool.name);
      }
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("el proceso Agent no implementa confirmation", () => {
    for (const file of walkTs(path.join(agentRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /confirm_request|confirm_response/, file);
      assert.doesNotMatch(text, /createConfirmationWaiter/, file);
      assert.doesNotMatch(text, /await import\(|import\(\s*[^)]+\)/, file);
    }
  });

  it("process.execute: process group POSIX, caps 64KiB/120s, sin Job Object", () => {
    const src = readFileSync(
      path.join(agentRoot, "src/tools/process-execute.ts"),
      "utf8",
    );
    assert.match(src, /shell:\s*false/);
    assert.match(src, /stdio:\s*\[\s*["']ignore["']/);
    assert.match(src, /process\.kill\(-pid/);
    assert.match(src, /detached:\s*processExecuteUsesProcessGroup\(\)/);
    assert.doesNotMatch(src, /unref\(/);
    assert.doesNotMatch(src, /kill\(-process\.pid/);
    assert.doesNotMatch(src, /ffi-napi|windows-kill|koffi|node-ffi/);
    assert.equal(PROCESS_EXECUTE_MAX_OUTPUT_BYTES, 64 * 1024);
    assert.equal(PROCESS_EXECUTE_MAX_TIMEOUT_MS, 120_000);
  });

  it("extensions/types no declara executionMode", () => {
    const src = readFileSync(
      path.join(agentRoot, "src/extensions/types.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /executionMode/);
  });
});
