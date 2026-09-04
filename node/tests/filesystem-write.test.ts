import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import {
  FILESYSTEM_WRITE,
  MAX_FILE_WRITE_BYTES,
  createFilesystemWriteTool,
  filesystemWriteTool,
} from "../src/tools/filesystem-write.ts";

const ctx = { conversationId: "c" };
const writeSrc = fileURLToPath(
  new URL("../src/tools/filesystem-write.ts", import.meta.url),
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

describe("filesystem.write", () => {
  it("está en el registry por defecto y es confirm (Hub, no Agent)", () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get(FILESYSTEM_WRITE.name);
    assert.ok(tool);
    assert.equal(tool.executionMode, "confirm");
    assert.equal(filesystemWriteTool.executionMode, "confirm");
    const src = readFileSync(writeSrc, "utf8");
    assert.doesNotMatch(src, /confirm_request/);
    assert.doesNotMatch(src, /ConfirmationWaiter/);
    assert.doesNotMatch(src, /from ["'].*confirmation/);
  });

  it("crea un archivo válido y devuelve path resuelto y bytes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-w-"));
    const filePath = path.join(dir, "nuevo.txt");
    const result = await filesystemWriteTool.execute(
      { path: filePath, content: "hola" },
      ctx,
    );
    assert.deepEqual(result, {
      ok: true,
      content: {
        path: path.resolve(filePath),
        bytes: Buffer.byteLength("hola", "utf8"),
      },
    });
    assert.equal(await readFile(filePath, "utf8"), "hola");
  });

  it("ejecución repetida sobrescribe el mismo archivo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-wo-"));
    const filePath = path.join(dir, "existe.txt");
    await writeFile(filePath, "viejo", "utf8");
    const first = await filesystemWriteTool.execute(
      { path: filePath, content: "nuevo" },
      ctx,
    );
    const second = await filesystemWriteTool.execute(
      { path: filePath, content: "otra vez" },
      ctx,
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(await readFile(filePath, "utf8"), "otra vez");
  });

  it("path vacío falla", async () => {
    const empty = await filesystemWriteTool.execute(
      { path: "", content: "x" },
      ctx,
    );
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error.code, "invalid_input");
  });

  it("content inválido falla", async () => {
    const missing = await filesystemWriteTool.execute({ path: "/tmp/x" }, ctx);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "invalid_input");

    const notString = await filesystemWriteTool.execute(
      { path: "/tmp/x", content: 1 },
      ctx,
    );
    assert.equal(notString.ok, false);
    if (!notString.ok) assert.equal(notString.error.code, "invalid_input");
  });

  it("respeta MAX_FILE_WRITE_BYTES", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-wb-"));
    const filePath = path.join(dir, "grande.txt");
    const content = "a".repeat(MAX_FILE_WRITE_BYTES + 1);
    const result = await filesystemWriteTool.execute(
      { path: filePath, content },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "file_too_large");
      assert.match(
        result.error.message,
        new RegExp(String(MAX_FILE_WRITE_BYTES)),
      );
    }
  });

  it("rechaza directorio como destino", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-wd-"));
    const result = await filesystemWriteTool.execute(
      { path: dir, content: "no" },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "not_a_file");
  });

  it("padre inexistente es file_write_error", async () => {
    const result = await filesystemWriteTool.execute(
      {
        path: path.join(tmpdir(), "no-dir-pa-fs-w", "a.txt"),
        content: "x",
      },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "file_write_error");
  });

  it("rechaza traversal relativo ../ y ../../", async () => {
    const up = await filesystemWriteTool.execute(
      { path: "../archivo", content: "x" },
      ctx,
    );
    assert.equal(up.ok, false);
    if (!up.ok) assert.equal(up.error.code, "path_not_allowed");

    const up2 = await filesystemWriteTool.execute(
      { path: "../../archivo", content: "x" },
      ctx,
    );
    assert.equal(up2.ok, false);
    if (!up2.ok) assert.equal(up2.error.code, "path_not_allowed");
  });

  it("acepta ruta absoluta dentro de un temporal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-abs-"));
    const filePath = path.resolve(dir, "abs.txt");
    const result = await filesystemWriteTool.execute(
      { path: filePath, content: "abs" },
      ctx,
    );
    assert.equal(result.ok, true);
    assert.equal(await readFile(filePath, "utf8"), "abs");
  });

  it("con root local, rechaza escritura fuera del temporal de prueba", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-root-"));
    const outside = path.join(dir, "..", "escape-pa-fs-w.txt");
    const tool = createFilesystemWriteTool({ root: dir });
    const result = await tool.execute(
      { path: outside, content: "fuera" },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "path_outside_root");
  });

  it("symlink de destino: writeFile sigue el enlace (riesgo no cerrado)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-sy-"));
    const target = path.join(dir, "real.txt");
    const link = path.join(dir, "link.txt");
    await writeFile(target, "original", "utf8");
    try {
      await symlink(target, link);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "EPERM" || code === "ENOTSUP" || code === "EACCES") {
        return;
      }
      throw err;
    }
    const result = await filesystemWriteTool.execute(
      { path: link, content: "via-link" },
      ctx,
    );
    assert.equal(result.ok, true);
    assert.equal(await readFile(target, "utf8"), "via-link");
  });
});

describe("filesystem.write MCP", () => {
  it("aparece en tools/list", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "fs-w-list", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      const tool = listed.tools.find((t) => t.name === FILESYSTEM_WRITE.name);
      assert.ok(tool);
      assert.equal(tool.description, FILESYSTEM_WRITE.description);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("MCP roundtrip escribe el archivo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-wm-"));
    const filePath = path.join(dir, "via-mcp.txt");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "fs-w-mcp", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const mcp = await client.callTool({
        name: FILESYSTEM_WRITE.name,
        arguments: {
          requestId: "rt_fw",
          context: { conversationId: "c1" },
          input: { path: filePath, content: "escrito" },
        },
      });
      const text = await mcpText(mcp);
      const parsed = JSON.parse(text) as {
        requestId: string;
        result: { ok: boolean; content: { bytes: number } };
      };
      assert.equal(parsed.requestId, "rt_fw");
      assert.equal(parsed.result.ok, true);
      assert.equal(await readFile(filePath, "utf8"), "escrito");
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
