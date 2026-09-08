import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createFilesystemListTool } from "../../src/tools/filesystem-list.ts";
import { createFilesystemReadTool } from "../../src/tools/filesystem-read.ts";
import { createFilesystemWriteTool } from "../../src/tools/filesystem-write.ts";
import { classifyContainment, resolveSafePath } from "../../src/tools/safe-path.ts";
import { readFileSync } from "node:fs";

const ctx = { conversationId: "c" };

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

describe("7G filesystem containment audit", () => {
  it("PHASE 59: lectura amplia fuera del root; escritura sigue contenida", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-7g-trav-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    await writeFile(path.join(base, "fuera.txt"), "secret", "utf8");
    const read = createFilesystemReadTool({ root });
    const write = createFilesystemWriteTool({ root });
    const list = createFilesystemListTool({ root });

    for (const p of ["../fuera.txt"]) {
      const r = await read.execute({ path: p }, ctx);
      assert.equal(r.ok, true, p);
      if (r.ok) {
        assert.equal((r.content as { content: string }).content, "secret");
      }
      const w = await write.execute({ path: p, content: "x" }, ctx);
      assert.equal(w.ok, false, p);
      if (!w.ok) assert.equal(w.error.code, "path_outside_root");
    }

    const absList = await list.execute({ path: base }, ctx);
    assert.equal(absList.ok, true);

    await mkdir(path.join(root, "sub"));
    const mix = await read.execute(
      { path: path.join("sub", "..", "..", "fuera.txt") },
      ctx,
    );
    assert.equal(mix.ok, true);
    assert.equal(existsSync(path.join(base, "fuera.txt")), true);
    assert.equal(await readFile(path.join(base, "fuera.txt"), "utf8"), "secret");
  });

  it("escritura rechaza absoluto fuera; lectura lo permite", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-7g-abs-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const sibling = path.join(base, "ws-secret");
    await mkdir(sibling);
    await writeFile(path.join(sibling, "x.txt"), "no", "utf8");
    const read = createFilesystemReadTool({ root });
    const write = createFilesystemWriteTool({ root });
    const outside = await read.execute(
      { path: path.join(base, "ws-secret", "x.txt") },
      ctx,
    );
    assert.equal(outside.ok, true);
    if (outside.ok) {
      assert.equal((outside.content as { content: string }).content, "no");
    }
    const w = await write.execute(
      { path: path.join(base, "ws-secret", "y.txt"), content: "x" },
      ctx,
    );
    assert.equal(w.ok, false);
    if (!w.ok) assert.equal(w.error.code, "path_outside_root");
    assert.equal(
      classifyContainment(path.join(sibling, "x.txt"), root),
      "outside",
    );
    assert.equal(classifyContainment(sibling, root), "outside");
  });

  it("normaliza trailing slash, punto y foo/../bar", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-norm-"));
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "sub", "a.txt"), "ok", "utf8");
    const list = createFilesystemListTool({ root });
    const withSlash = await list.execute({ path: "sub/" }, ctx);
    assert.equal(withSlash.ok, true);
    const dot = await list.execute({ path: "." }, ctx);
    assert.equal(dot.ok, true);
    const read = createFilesystemReadTool({ root });
    const viaDotDot = await read.execute(
      { path: path.join("sub", "..", "sub", "a.txt") },
      ctx,
    );
    assert.equal(viaDotDot.ok, true);
    if (viaDotDot.ok) {
      assert.equal(
        (viaDotDot.content as { content: string }).content,
        "ok",
      );
    }
  });

  it("root no es archivo; sí es directorio listable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-root-"));
    const read = createFilesystemReadTool({ root });
    const write = createFilesystemWriteTool({ root });
    const list = createFilesystemListTool({ root });
    const asFile = await read.execute({ path: root }, ctx);
    assert.equal(asFile.ok, false);
    if (!asFile.ok) assert.equal(asFile.error.code, "not_a_file");
    const w = await write.execute({ path: ".", content: "x" }, ctx);
    assert.equal(w.ok, false);
    const ls = await list.execute({ path: "." }, ctx);
    assert.equal(ls.ok, true);
  });

  it("archivo vs directorio: read/list cruzados fallan", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-type-"));
    await writeFile(path.join(root, "f.txt"), "x", "utf8");
    await mkdir(path.join(root, "d"));
    const read = createFilesystemReadTool({ root });
    const list = createFilesystemListTool({ root });
    const rDir = await read.execute({ path: "d" }, ctx);
    assert.equal(rDir.ok, false);
    if (!rDir.ok) assert.equal(rDir.error.code, "not_a_file");
    const lFile = await list.execute({ path: "f.txt" }, ctx);
    assert.equal(lFile.ok, false);
    if (!lFile.ok) assert.equal(lFile.error.code, "not_a_directory");
  });

  it("PHASE 59: symlink de lectura fuera permitido; write sigue contenida", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-7g-sy-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outsideDir = path.join(base, "out");
    await mkdir(outsideDir);
    await writeFile(path.join(outsideDir, "leak.txt"), "leak", "utf8");
    await mkdir(path.join(root, "in"));
    await writeFile(path.join(root, "in", "ok.txt"), "ok", "utf8");
    const read = createFilesystemReadTool({ root });
    const write = createFilesystemWriteTool({ root });
    await skipIfNoSymlink(async () => {
      await symlink(outsideDir, path.join(root, "link-out"));
      const mid = await read.execute(
        { path: path.join("link-out", "leak.txt") },
        ctx,
      );
      assert.equal(mid.ok, true);
      if (mid.ok) {
        assert.equal((mid.content as { content: string }).content, "leak");
      }

      await symlink(path.join(outsideDir, "leak.txt"), path.join(root, "file-out"));
      const destFile = await read.execute({ path: "file-out" }, ctx);
      assert.equal(destFile.ok, true);

      const w = await write.execute(
        { path: path.join("link-out", "evil.txt"), content: "x" },
        ctx,
      );
      assert.equal(w.ok, false);
      if (!w.ok) assert.equal(w.error.code, "symlink_not_allowed");

      await symlink(path.join(root, "in", "ok.txt"), path.join(root, "alias.txt"));
      const inn = await read.execute({ path: "alias.txt" }, ctx);
      assert.equal(inn.ok, true);
    });
  });

  it("Windows: unidades distintas son outside", {
    skip: process.platform !== "win32",
  }, () => {
    assert.equal(
      classifyContainment("D:\\other\\a.txt", "C:\\workspace"),
      "outside",
    );
  });

  it("filesystem.root que es un archivo no permite operaciones", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-7g-rf-"));
    const asFile = path.join(dir, "notdir");
    await writeFile(asFile, "x", "utf8");
    const read = createFilesystemReadTool({ root: asFile });
    const r = await read.execute({ path: "a.txt" }, ctx);
    assert.equal(r.ok, false);
  });

  it("classifyContainment no usa startsWith de prefijo", () => {
    const src = readFileSync(
      new URL("../../src/tools/safe-path.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /path\.relative/);
    assert.doesNotMatch(
      src,
      /resolvedCandidate\.startsWith\(resolvedRoot\)/,
    );
  });
});

describe("7G TOCTOU documentado (no cerrado)", () => {
  it("entre resolveSafePath y writeFile un symlink nuevo puede redirigir", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-7g-toc-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const dest = path.join(root, "nuevo.txt");
    const outside = path.join(base, "fuera.txt");
    await writeFile(outside, "orig", "utf8");

    const resolved = await resolveSafePath("nuevo.txt", root);
    assert.equal(resolved.ok, true);

    await skipIfNoSymlink(async () => {
      await symlink(outside, dest);
      const { writeFile: wf } = await import("node:fs/promises");
      await wf(dest, "pwn", "utf8");
      assert.equal(await readFile(outside, "utf8"), "pwn");
    });
  });
});
