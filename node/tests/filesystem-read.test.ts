import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import {
  FILESYSTEM_READ,
  MAX_FILE_READ_BYTES,
  createFilesystemReadTool,
  filesystemReadTool,
} from "../src/tools/filesystem-read.ts";

const ctx = { conversationId: "c" };
const readSrc = fileURLToPath(
  new URL("../src/tools/filesystem-read.ts", import.meta.url),
);

async function mcpText(mcp: unknown): Promise<string> {
  assert.ok(mcp && typeof mcp === "object");
  const content = (mcp as { content?: unknown }).content;
  assert.ok(Array.isArray(content) && content.length > 0);
  const first = content[0] as { type?: unknown; text?: unknown };
  assert.equal(first.type, "text");
  assert.equal(typeof first.text, "string");
  return first.text as string;
}

describe("filesystem.read", () => {
  it("está en el registry por defecto y es automatic (sin confirm en Agent)", () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get(FILESYSTEM_READ.name);
    assert.ok(tool);
    assert.equal(tool.executionMode, "automatic");
    assert.equal(filesystemReadTool.executionMode, "automatic");
    const src = readFileSync(readSrc, "utf8");
    assert.doesNotMatch(src, /confirm_request/);
    assert.doesNotMatch(src, /ConfirmationWaiter/);
  });

  it("lee un archivo pequeño y devuelve path, content y bytes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-read-"));
    const filePath = path.join(dir, "nota.txt");
    await writeFile(filePath, "hola agente", "utf8");
    const result = await filesystemReadTool.execute({ path: filePath }, ctx);
    assert.deepEqual(result, {
      ok: true,
      content: {
        path: path.resolve(filePath),
        content: "hola agente",
        bytes: Buffer.byteLength("hola agente", "utf8"),
      },
    });
  });

  it("path vacío y \\0 fallan", async () => {
    const empty = await filesystemReadTool.execute({ path: "" }, ctx);
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error.code, "invalid_input");

    const blank = await filesystemReadTool.execute({ path: "   " }, ctx);
    assert.equal(blank.ok, false);
    if (!blank.ok) assert.equal(blank.error.code, "invalid_input");

    const nul = await filesystemReadTool.execute({ path: "a\0b.txt" }, ctx);
    assert.equal(nul.ok, false);
    if (!nul.ok) assert.equal(nul.error.code, "invalid_input");
  });

  it("path inexistente es error controlado", async () => {
    const result = await filesystemReadTool.execute(
      { path: path.join(tmpdir(), "no-existe-pa-fs-read.txt") },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "file_not_found");
  });

  it("directorio no es archivo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-dir-"));
    const result = await filesystemReadTool.execute({ path: dir }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "not_a_file");
  });

  it("sin root rechaza traversal ..", async () => {
    const result = await filesystemReadTool.execute(
      { path: "../outside.txt" },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "path_not_allowed");
  });

  it("archivo mayor que MAX_FILE_READ_BYTES es file_too_large", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-big-"));
    const filePath = path.join(dir, "grande.bin");
    await writeFile(filePath, Buffer.alloc(MAX_FILE_READ_BYTES + 1));
    const result = await filesystemReadTool.execute({ path: filePath }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "file_too_large");
      assert.match(result.error.message, new RegExp(String(MAX_FILE_READ_BYTES)));
    }
  });
});

describe("filesystem.read MCP", () => {
  it("aparece en tools/list", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "fs-list", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      const tool = listed.tools.find((t) => t.name === FILESYSTEM_READ.name);
      assert.ok(tool);
      assert.equal(tool.description, FILESYSTEM_READ.description);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("MCP roundtrip lee el archivo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-mcp-"));
    const filePath = path.join(dir, "via-mcp.txt");
    await writeFile(filePath, "desde mcp", "utf8");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "fs-mcp", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const mcp = await client.callTool({
        name: FILESYSTEM_READ.name,
        arguments: {
          requestId: "rt_fs",
          context: { conversationId: "c1" },
          input: { path: filePath },
        },
      });
      const text = await mcpText(mcp);
      const parsed = JSON.parse(text) as {
        requestId: string;
        result: {
          ok: boolean;
          content: { content: string; bytes: number };
        };
      };
      assert.equal(parsed.requestId, "rt_fs");
      assert.equal(parsed.result.ok, true);
      assert.equal(parsed.result.content.content, "desde mcp");
      assert.equal(
        parsed.result.content.bytes,
        Buffer.byteLength("desde mcp", "utf8"),
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});

describe("createFilesystemReadTool sin root (legado)", () => {
  it("es la misma frontera que el export filesystemReadTool", async () => {
    const tool = createFilesystemReadTool();
    assert.equal(tool.executionMode, "automatic");
  });
});
