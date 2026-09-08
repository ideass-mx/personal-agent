import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
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
  FILESYSTEM_LIST,
  createFilesystemListTool,
  filesystemListTool,
} from "../src/tools/filesystem-list.ts";

const ctx = { conversationId: "c" };
const listSrc = fileURLToPath(
  new URL("../src/tools/filesystem-list.ts", import.meta.url),
);

type ListContent = {
  path: string;
  entries: Array<{ name: string; type: string }>;
};

function asList(result: { ok: true; content: unknown }): ListContent {
  return result.content as ListContent;
}

async function skipIfNoSymlink(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    if (code === "EPERM" || code === "ENOTSUP" || code === "EACCES") return;
    throw err;
  }
}

async function mcpText(mcp: unknown): Promise<string> {
  assert.ok(mcp && typeof mcp === "object");
  const content = (mcp as { content?: unknown }).content;
  assert.ok(Array.isArray(content) && content.length > 0);
  const first = content[0] as { type?: unknown; text?: unknown };
  assert.equal(first.type, "text");
  assert.equal(typeof first.text, "string");
  return first.text as string;
}

describe("filesystem.list", () => {
  it("está en el registry por defecto y es automatic (sin confirm en Agent)", () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get(FILESYSTEM_LIST.name);
    assert.ok(tool);
    assert.equal(tool.executionMode, "automatic");
    assert.equal(filesystemListTool.executionMode, "automatic");
    const src = readFileSync(listSrc, "utf8");
    assert.doesNotMatch(src, /confirm_request/);
    assert.doesNotMatch(src, /ConfirmationWaiter/);
    assert.doesNotMatch(src, /from ["'].*confirmation/);
    assert.doesNotMatch(src, /exec\(|spawn\(|execFile\(/);
  });

  it("lista un directorio: file, directory, orden determinista, no recursivo, sin contenido", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-ls-"));
    const secret = "NO_DEBE_APARECER_EN_LIST";
    await writeFile(path.join(dir, "zeta.txt"), secret, "utf8");
    await writeFile(path.join(dir, "alfa.txt"), "a", "utf8");
    await mkdir(path.join(dir, "sub"));
    await writeFile(path.join(dir, "sub", "oculto.txt"), secret, "utf8");
    const before = await stat(path.join(dir, "alfa.txt"));

    const result = await filesystemListTool.execute({ path: dir }, ctx);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asList(result);
    assert.equal(body.path, path.resolve(dir));
    assert.deepEqual(
      body.entries.map((e) => e.name),
      ["alfa.txt", "sub", "zeta.txt"],
    );
    assert.equal(body.entries.find((e) => e.name === "alfa.txt")?.type, "file");
    assert.equal(body.entries.find((e) => e.name === "sub")?.type, "directory");
    assert.equal(
      body.entries.some((e) => e.name === "oculto.txt"),
      false,
    );
    assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));

    const after = await stat(path.join(dir, "alfa.txt"));
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.size, before.size);
    assert.equal(await readFile(path.join(dir, "alfa.txt"), "utf8"), "a");
    assert.equal(await readFile(path.join(dir, "zeta.txt"), "utf8"), secret);
  });

  it("devuelve symlink como type symlink", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-lsl-"));
    const target = path.join(dir, "real.txt");
    await writeFile(target, "x", "utf8");
    await skipIfNoSymlink(async () => {
      await symlink(target, path.join(dir, "enlace.txt"));
      const result = await filesystemListTool.execute({ path: dir }, ctx);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const body = asList(result);
      assert.equal(
        body.entries.find((e) => e.name === "enlace.txt")?.type,
        "symlink",
      );
    });
  });

  it("directorio inexistente es file_not_found", async () => {
    const result = await filesystemListTool.execute(
      { path: path.join(tmpdir(), "pa-ls-no-existe") },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "file_not_found");
  });

  it("archivo no es directorio", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-fs-lsf-"));
    const filePath = path.join(dir, "solo.txt");
    await writeFile(filePath, "x", "utf8");
    const result = await filesystemListTool.execute({ path: filePath }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "not_a_directory");
  });

  it("input inválido", async () => {
    const empty = await filesystemListTool.execute({ path: "" }, ctx);
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error.code, "invalid_input");
    const bad = await filesystemListTool.execute({ path: 1 }, ctx);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.code, "invalid_input");
    const obj = await filesystemListTool.execute(null, ctx);
    assert.equal(obj.ok, false);
    if (!obj.ok) assert.equal(obj.error.code, "invalid_input");
  });

  it("PHASE 59: sin root permite resolver traversal relativo si existe", async () => {
    const result = await filesystemListTool.execute({ path: ".." }, ctx);
    // ".." desde cwd suele existir → listado OK (lectura amplia).
    assert.equal(result.ok, true);
  });
});

describe("filesystem.list con root", () => {
  it("lista el root y un subdirectorio", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-ls-root-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "a.txt"), "a", "utf8");
    await writeFile(path.join(root, "sub", "b.txt"), "b", "utf8");
    const tool = createFilesystemListTool({ root });

    const atRoot = await tool.execute({ path: "." }, ctx);
    assert.equal(atRoot.ok, true);
    if (atRoot.ok) {
      const body = asList(atRoot);
      assert.equal(body.path, root);
      assert.deepEqual(
        body.entries.map((e) => e.name),
        ["a.txt", "sub"],
      );
    }

    const absRoot = await tool.execute({ path: root }, ctx);
    assert.equal(absRoot.ok, true);

    const child = await tool.execute({ path: "sub" }, ctx);
    assert.equal(child.ok, true);
    if (child.ok) {
      const body = asList(child);
      assert.deepEqual(
        body.entries.map((e) => e.name),
        ["b.txt"],
      );
    }
  });

  it("PHASE 59: list fuera del root permitido", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-ls-out-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "fuera");
    await mkdir(outside);
    await writeFile(path.join(outside, "secret.txt"), "secreto-list", "utf8");
    const sibling = path.join(base, `${path.basename(root)}-secret`);
    await mkdir(sibling);
    const tool = createFilesystemListTool({ root });

    const absOut = await tool.execute({ path: outside }, ctx);
    assert.equal(absOut.ok, true);
    if (absOut.ok) {
      assert.ok(asList(absOut).entries.some((e) => e.name === "secret.txt"));
    }

    const trav = await tool.execute({ path: "../fuera" }, ctx);
    assert.equal(trav.ok, true);

    const sib = await tool.execute({ path: sibling }, ctx);
    assert.equal(sib.ok, true);
  });

  it("PHASE 59: symlink de directorio hacia fuera se permite listar", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-ls-sy-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outsideDir = path.join(base, "out-dir");
    await mkdir(outsideDir);
    await writeFile(path.join(outsideDir, "leak.txt"), "visible", "utf8");
    await mkdir(path.join(root, "inside"));
    await writeFile(path.join(root, "inside", "ok.txt"), "ok", "utf8");
    const tool = createFilesystemListTool({ root });

    await skipIfNoSymlink(async () => {
      await symlink(outsideDir, path.join(root, "link-out"));
      const out = await tool.execute({ path: "link-out" }, ctx);
      assert.equal(out.ok, true);
      if (out.ok) {
        assert.ok(asList(out).entries.some((e) => e.name === "leak.txt"));
      }

      await symlink(path.join(root, "inside"), path.join(root, "link-in"));
      const inn = await tool.execute({ path: "link-in" }, ctx);
      assert.equal(inn.ok, true);
      if (inn.ok) {
        const body = asList(inn);
        assert.deepEqual(
          body.entries.map((e) => e.name),
          ["ok.txt"],
        );
      }
    });
  });
});

describe("filesystem.list MCP", () => {
  it("aparece en tools/list y roundtrip lista el directorio", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-ls-mcp-"));
    await writeFile(path.join(dir, "n.txt"), "n", "utf8");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "ls-mcp", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === FILESYSTEM_LIST.name));
      const mcp = await client.callTool({
        name: FILESYSTEM_LIST.name,
        arguments: {
          requestId: "rt_ls",
          context: { conversationId: "c1" },
          input: { path: dir },
        },
      });
      const text = await mcpText(mcp);
      const parsed = JSON.parse(text) as {
        requestId: string;
        result: { ok: boolean; content: ListContent };
      };
      assert.equal(parsed.requestId, "rt_ls");
      assert.equal(parsed.result.ok, true);
      assert.ok(parsed.result.content.entries.some((e) => e.name === "n.txt"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
