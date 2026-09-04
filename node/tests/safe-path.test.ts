import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { classifyContainment, resolveSafePath } from "../src/tools/safe-path.ts";

const ctxRoot = async () => {
  const base = await mkdtemp(path.join(tmpdir(), "pa-safe-"));
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

describe("classifyContainment", () => {
  it("distingue exact / hijo / hermano de prefijo similar / padre", async () => {
    const { base, root } = await ctxRoot();
    const child = path.join(root, "notes", "a.txt");
    const sibling = path.join(base, `${path.basename(root)}-secret`, "x.txt");
    const parentFile = path.join(base, "outside.txt");
    assert.equal(classifyContainment(root, root), "exact");
    assert.equal(classifyContainment(child, root), "child");
    assert.equal(classifyContainment(sibling, root), "outside");
    assert.equal(classifyContainment(parentFile, root), "outside");
    assert.equal(classifyContainment(base, root), "outside");
  });

  it("Windows: unidades distintas son outside", { skip: process.platform !== "win32" }, () => {
    assert.equal(classifyContainment("D:\\other\\a.txt", "C:\\workspace"), "outside");
  });

  it("Windows: casing y separadores", { skip: process.platform !== "win32" }, () => {
    assert.equal(classifyContainment("C:\\Work\\a.txt", "C:/Work"), "child");
    assert.equal(classifyContainment("c:\\work\\a.txt", "C:\\Work"), "child");
  });

  it("POSIX: absolutos y separadores /", { skip: process.platform === "win32" }, () => {
    assert.equal(classifyContainment("/tmp/agent/a.txt", "/tmp/agent"), "child");
    assert.equal(classifyContainment("/tmp/agent-secret/a.txt", "/tmp/agent"), "outside");
  });
});

describe("resolveSafePath con root", () => {
  it("relativo y absoluto dentro del root", async () => {
    const { root } = await ctxRoot();
    const rel = await resolveSafePath("notes/a.txt", root);
    assert.equal(rel.ok, true);
    if (rel.ok) {
      assert.equal(rel.resolved, path.join(root, "notes", "a.txt"));
    }
    const abs = await resolveSafePath(path.join(root, "b.txt"), root);
    assert.equal(abs.ok, true);
  });

  it("absoluto fuera, ../ y múltiples ..", async () => {
    const { base, root } = await ctxRoot();
    const absOut = await resolveSafePath(path.join(base, "no.txt"), root);
    assert.equal(absOut.ok, false);
    if (!absOut.ok && !absOut.result.ok) {
      assert.equal(absOut.result.error.code, "path_outside_root");
    }

    const up = await resolveSafePath("../outside.txt", root);
    assert.equal(up.ok, false);
    if (!up.ok && !up.result.ok) {
      assert.equal(up.result.error.code, "path_outside_root");
    }

    const up2 = await resolveSafePath("a/../../outside.txt", root);
    assert.equal(up2.ok, false);
    if (!up2.ok && !up2.result.ok) {
      assert.equal(up2.result.error.code, "path_outside_root");
    }
  });

  it("foo/../bar permanece dentro del root", async () => {
    const { root } = await ctxRoot();
    await mkdir(path.join(root, "foo"));
    const ok = await resolveSafePath(path.join("foo", "..", "bar.txt"), root);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.resolved, path.join(root, "bar.txt"));
  });

  it("el root no es un archivo válido", async () => {
    const { root } = await ctxRoot();
    const same = await resolveSafePath(root, root);
    assert.equal(same.ok, false);
    if (!same.ok && !same.result.ok) {
      assert.equal(same.result.error.code, "path_not_allowed");
    }
  });

  it("hermano con prefijo similar queda outside", async () => {
    const { base, root } = await ctxRoot();
    const secret = path.join(base, `${path.basename(root)}-secret`);
    await mkdir(secret);
    const r = await resolveSafePath(path.join(secret, "file.txt"), root);
    assert.equal(r.ok, false);
    if (!r.ok && !r.result.ok) {
      assert.equal(r.result.error.code, "path_outside_root");
    }
  });

  it("destino inexistente con padre existente", async () => {
    const { root } = await ctxRoot();
    await mkdir(path.join(root, "notes"));
    const r = await resolveSafePath("notes/nuevo.txt", root);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.resolved, path.join(root, "notes", "nuevo.txt"));
  });

  it("padre inexistente: path lexical dentro del root", async () => {
    const { root } = await ctxRoot();
    const r = await resolveSafePath("no-dir/a.txt", root);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.resolved, path.join(root, "no-dir", "a.txt"));
  });

  it("root inexistente", async () => {
    const missing = path.join(tmpdir(), "pa-no-root-xyz");
    const r = await resolveSafePath("a.txt", missing);
    assert.equal(r.ok, false);
    if (!r.ok && !r.result.ok) {
      assert.equal(r.result.error.code, "file_write_error");
    }
  });

  it("symlink de destino hacia fuera", async () => {
    const { base, root } = await ctxRoot();
    const outside = path.join(base, "secret.txt");
    await writeFile(outside, "no", "utf8");
    const link = path.join(root, "link.txt");
    await skipIfNoSymlink(async () => {
      await symlink(outside, link);
      const r = await resolveSafePath("link.txt", root);
      assert.equal(r.ok, false);
      if (!r.ok && !r.result.ok) {
        assert.equal(r.result.error.code, "symlink_not_allowed");
      }
    });
  });

  it("symlink de directorio padre hacia fuera", async () => {
    const { base, root } = await ctxRoot();
    const outsideDir = path.join(base, "outside-dir");
    await mkdir(outsideDir);
    const safe = path.join(root, "safe");
    await mkdir(safe);
    const link = path.join(safe, "link");
    await skipIfNoSymlink(async () => {
      await symlink(outsideDir, link);
      const r = await resolveSafePath(path.join("safe", "link", "passwd"), root);
      assert.equal(r.ok, false);
      if (!r.ok && !r.result.ok) {
        assert.equal(r.result.error.code, "symlink_not_allowed");
      }
    });
  });

  it("symlink que apunta dentro del root", async () => {
    const { root } = await ctxRoot();
    const real = path.join(root, "real.txt");
    await writeFile(real, "orig", "utf8");
    const link = path.join(root, "alias.txt");
    await skipIfNoSymlink(async () => {
      await symlink(real, link);
      const r = await resolveSafePath("alias.txt", root);
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.resolved, real);
    });
  });
});

describe("resolveSafePath sin root (legacy)", () => {
  it("rechaza .. y acepta absoluto", async () => {
    const up = await resolveSafePath("../x.txt");
    assert.equal(up.ok, false);
    if (!up.ok && !up.result.ok) {
      assert.equal(up.result.error.code, "path_not_allowed");
    }
    const dir = await mkdtemp(path.join(tmpdir(), "pa-leg-"));
    const abs = path.join(dir, "a.txt");
    const ok = await resolveSafePath(abs);
    assert.equal(ok.ok, true);
  });
});

describe("resolveSafePath expect directory", () => {
  it("permite el root y un subdirectorio", async () => {
    const { root } = await ctxRoot();
    await mkdir(path.join(root, "sub"));
    const same = await resolveSafePath(".", root, "directory");
    assert.equal(same.ok, true);
    if (same.ok) assert.equal(same.resolved, root);
    const child = await resolveSafePath("sub", root, "directory");
    assert.equal(child.ok, true);
    if (child.ok) assert.equal(child.resolved, path.join(root, "sub"));
  });

  it("un archivo no es directorio", async () => {
    const { root } = await ctxRoot();
    await writeFile(path.join(root, "a.txt"), "x", "utf8");
    const r = await resolveSafePath("a.txt", root, "directory");
    assert.equal(r.ok, false);
    if (!r.ok && !r.result.ok) {
      assert.equal(r.result.error.code, "not_a_directory");
    }
  });
});
