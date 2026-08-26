import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createFilesystemWriteTool } from "../src/tools/filesystem-write.ts";

const ctx = { conversationId: "c" };

describe("filesystem.write con root", () => {
  it("escribe relativo y absoluto dentro del root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-wroot-"));
    const tool = createFilesystemWriteTool({ root });
    const rel = await tool.execute({ path: "a.txt", content: "rel" }, ctx);
    assert.equal(rel.ok, true);
    assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "rel");

    const absPath = path.join(root, "b.txt");
    const abs = await tool.execute({ path: absPath, content: "abs" }, ctx);
    assert.equal(abs.ok, true);
    assert.equal(await readFile(absPath, "utf8"), "abs");
  });

  it("padre inexistente sigue siendo file_write_error", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-wmiss-"));
    const tool = createFilesystemWriteTool({ root });
    const result = await tool.execute(
      { path: path.join("no-dir", "a.txt"), content: "x" },
      ctx,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "file_write_error");
  });

  it("no crea archivos fuera del root", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-wout-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "fuera.txt");
    const tool = createFilesystemWriteTool({ root });
    const result = await tool.execute({ path: outside, content: "no" }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "path_outside_root");
    assert.equal(existsSync(outside), false);
  });
});
