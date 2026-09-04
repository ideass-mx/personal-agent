import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createFilesystemReadTool } from "../src/tools/filesystem-read.ts";

const ctx = { conversationId: "c" };

const ctxRoot = async () => {
  const base = await mkdtemp(path.join(tmpdir(), "pa-rroot-"));
  const root = path.join(base, "workspace");
  await mkdir(root);
  return { base, root };
};

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

describe("filesystem.read con root", () => {
  it("archivo normal, relativo y absoluto dentro del root", async () => {
    const { root } = await ctxRoot();
    await writeFile(path.join(root, "a.txt"), "dentro", "utf8");
    const tool = createFilesystemReadTool({ root });

    const rel = await tool.execute({ path: "a.txt" }, ctx);
    assert.equal(rel.ok, true);
    if (rel.ok) {
      const body = rel.content as { content: string; path: string; bytes: number };
      assert.equal(body.content, "dentro");
      assert.equal(body.path, path.join(root, "a.txt"));
      assert.equal(body.bytes, Buffer.byteLength("dentro", "utf8"));
    }

    const abs = await tool.execute({ path: path.join(root, "a.txt") }, ctx);
    assert.equal(abs.ok, true);
    if (abs.ok) {
      assert.equal((abs.content as { content: string }).content, "dentro");
    }
  });

  it("fuera del root, traversal y hermano de prefijo similar", async () => {
    const { base, root } = await ctxRoot();
    const secret = "secreto-fuera";
    const outside = path.join(base, "fuera.txt");
    await writeFile(outside, secret, "utf8");
    const siblingDir = path.join(base, `${path.basename(root)}-secret`);
    await mkdir(siblingDir);
    const sibling = path.join(siblingDir, "x.txt");
    await writeFile(sibling, secret, "utf8");
    const tool = createFilesystemReadTool({ root });

    const absOut = await tool.execute({ path: outside }, ctx);
    assert.equal(absOut.ok, false);
    if (!absOut.ok) {
      assert.equal(absOut.error.code, "path_outside_root");
      assert.doesNotMatch(absOut.error.message, /secreto-fuera/);
    }

    const trav = await tool.execute({ path: "../fuera.txt" }, ctx);
    assert.equal(trav.ok, false);
    if (!trav.ok) assert.equal(trav.error.code, "path_outside_root");

    const sib = await tool.execute({ path: sibling }, ctx);
    assert.equal(sib.ok, false);
    if (!sib.ok) assert.equal(sib.error.code, "path_outside_root");
  });

  it("directorio, inexistente y root inexistente", async () => {
    const { root } = await ctxRoot();
    const tool = createFilesystemReadTool({ root });
    await mkdir(path.join(root, "sub"));
    const nestedDir = await tool.execute({ path: "sub" }, ctx);
    assert.equal(nestedDir.ok, false);
    if (!nestedDir.ok) assert.equal(nestedDir.error.code, "not_a_file");

    const dir = await tool.execute({ path: root }, ctx);
    assert.equal(dir.ok, false);
    if (!dir.ok) assert.equal(dir.error.code, "path_not_allowed");

    const missing = await tool.execute({ path: "no.txt" }, ctx);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, "file_not_found");

    const gone = createFilesystemReadTool({
      root: path.join(tmpdir(), "pa-no-read-root"),
    });
    const badRoot = await gone.execute({ path: "a.txt" }, ctx);
    assert.equal(badRoot.ok, false);
    if (!badRoot.ok) assert.equal(badRoot.error.code, "file_write_error");
  });

  it("symlink hacia fuera se rechaza; hacia dentro se permite", async () => {
    const { base, root } = await ctxRoot();
    const outside = path.join(base, "secret.txt");
    await writeFile(outside, "no-debe-leerlo", "utf8");
    const inside = path.join(root, "real.txt");
    await writeFile(inside, "ok-dentro", "utf8");
    const tool = createFilesystemReadTool({ root });

    await skipIfNoSymlink(async () => {
      await symlink(outside, path.join(root, "link-out.txt"));
      const out = await tool.execute({ path: "link-out.txt" }, ctx);
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.error.code, "symlink_not_allowed");
        assert.doesNotMatch(JSON.stringify(out), /no-debe-leerlo/);
      }

      await symlink(inside, path.join(root, "link-in.txt"));
      const inn = await tool.execute({ path: "link-in.txt" }, ctx);
      assert.equal(inn.ok, true);
      if (inn.ok) {
        assert.equal((inn.content as { content: string }).content, "ok-dentro");
      }
    });
  });
});
