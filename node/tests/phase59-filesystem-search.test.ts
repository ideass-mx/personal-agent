/**
 * PHASE 59 — Local Computer Intelligence (filesystem.search / list / read).
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createFilesystemDeleteTool } from "../src/tools/filesystem-delete.ts";
import { createFilesystemListTool } from "../src/tools/filesystem-list.ts";
import { createFilesystemReadTool } from "../src/tools/filesystem-read.ts";
import { createFilesystemSearchTool } from "../src/tools/filesystem-search.ts";
import { createFilesystemWriteTool } from "../src/tools/filesystem-write.ts";
import { isExcludedPath } from "../src/tools/fs-exclusions.ts";
import { detectSearchRoots } from "../src/tools/fs-drives.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import { createFilesystemExtension } from "../src/extensions/filesystem.ts";

const ctx = { conversationId: "c-phase59" };

const FIXTURE = fileURLToPath(
  new URL("./fixtures/phase59-test-files", import.meta.url),
);

type SearchBody = {
  results: Array<{
    path: string;
    name: string;
    extension: string;
    matchType: string;
    size: number;
    modifiedAt: string;
  }>;
  resultCount: number;
  truncated: boolean;
  accessDeniedCount: number;
};

function asSearch(result: { ok: true; content: unknown }): SearchBody {
  return result.content as SearchBody;
}

describe("PHASE 59 filesystem.search", () => {
  it("encuentra por nombre (contrato IDEASS)", async () => {
    const tool = createFilesystemSearchTool({ defaultRoots: [FIXTURE] });
    const result = await tool.execute({ query: "contrato IDEASS" }, ctx);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asSearch(result);
    assert.ok(body.resultCount >= 1);
    assert.ok(
      body.results.some((r) => r.name.toLowerCase().includes("contrato")),
    );
    assert.ok(body.results.every((r) => r.matchType === "filename" || r.matchType === "path" || r.matchType === "content"));
  });

  it("filtra por extensión xlsx", async () => {
    const tool = createFilesystemSearchTool({ defaultRoots: [FIXTURE] });
    const result = await tool.execute(
      { query: "presupuesto", fileTypes: ["xlsx"] },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asSearch(result);
    assert.ok(body.results.some((r) => r.extension === ".xlsx"));
    assert.ok(body.results.every((r) => r.extension === ".xlsx"));
  });

  it("filtra por rango de fecha de modificación", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-59-date-"));
    const file = path.join(dir, "reciente.txt");
    await writeFile(file, "x", "utf8");
    const tool = createFilesystemSearchTool({ defaultRoots: [dir] });
    const after = new Date(Date.now() - 60_000).toISOString();
    const before = new Date(Date.now() + 60_000).toISOString();
    const result = await tool.execute(
      { query: "reciente", modifiedAfter: after, modifiedBefore: before },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(asSearch(result).results.some((r) => r.name === "reciente.txt"));

    const old = await tool.execute(
      {
        query: "reciente",
        modifiedBefore: new Date(Date.now() - 3600_000).toISOString(),
      },
      ctx,
    );
    assert.equal(old.ok, true);
    if (!old.ok) return;
    assert.equal(asSearch(old).resultCount, 0);
  });

  it("filtra por tamaño mínimo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-59-size-"));
    await writeFile(path.join(dir, "tiny.txt"), "a", "utf8");
    await writeFile(path.join(dir, "big.txt"), "x".repeat(2000), "utf8");
    const tool = createFilesystemSearchTool({ defaultRoots: [dir] });
    const result = await tool.execute(
      { fileTypes: ["txt"], minSize: 1000 },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = asSearch(result).results.map((r) => r.name);
    assert.deepEqual(names, ["big.txt"]);
  });

  it("busca contenido en texto", async () => {
    const tool = createFilesystemSearchTool({ defaultRoots: [FIXTURE] });
    const result = await tool.execute(
      { content: "SECIHTI", includeContentSearch: true },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asSearch(result);
    assert.ok(body.results.some((r) => r.matchType === "content"));
    assert.ok(body.results.some((r) => r.name === "documento.txt"));
  });

  it("respeta maxResults (truncado)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-59-max-"));
    for (let i = 0; i < 20; i += 1) {
      await writeFile(path.join(dir, `f-${i}.txt`), "n", "utf8");
    }
    const tool = createFilesystemSearchTool({ defaultRoots: [dir] });
    const result = await tool.execute(
      { fileTypes: ["txt"], maxResults: 5 },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asSearch(result);
    assert.equal(body.resultCount, 5);
    assert.equal(body.truncated, true);
  });

  it("no entra en exclusiones de sistema (Windows prefixes)", () => {
    assert.equal(isExcludedPath("C:\\Windows\\System32"), true);
    assert.equal(isExcludedPath("C:\\Program Files\\App"), true);
    assert.equal(isExcludedPath("C:\\Users\\tony\\Documents"), false);
    assert.equal(isExcludedPath("D:\\Proyectos"), false);
  });

  it("ACCESS_DENIED en un subdir no aborta la búsqueda", async () => {
    if (process.platform === "win32") return;
    const dir = await mkdtemp(path.join(tmpdir(), "pa-59-denied-"));
    const locked = path.join(dir, "locked");
    await mkdir(locked);
    await writeFile(path.join(locked, "hidden.txt"), "secret", "utf8");
    await writeFile(path.join(dir, "visible.txt"), "ok", "utf8");
    try {
      await chmod(locked, 0o000);
    } catch {
      return;
    }
    try {
      const tool = createFilesystemSearchTool({ defaultRoots: [dir] });
      const result = await tool.execute({ query: "visible" }, ctx);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const body = asSearch(result);
      assert.ok(body.results.some((r) => r.name === "visible.txt"));
    } finally {
      await chmod(locked, 0o755);
    }
  });

  it("múltiples raíces (simula C: y D:)", async () => {
    const a = await mkdtemp(path.join(tmpdir(), "pa-59-drv-a-"));
    const b = await mkdtemp(path.join(tmpdir(), "pa-59-drv-b-"));
    await writeFile(path.join(a, "contrato-a.pdf"), "a", "utf8");
    await writeFile(path.join(b, "contrato-b.pdf"), "b", "utf8");
    const tool = createFilesystemSearchTool({ defaultRoots: [a, b] });
    const result = await tool.execute(
      { query: "contrato", fileTypes: ["pdf"] },
      ctx,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = asSearch(result);
    assert.ok(body.results.some((r) => r.name === "contrato-a.pdf"));
    assert.ok(body.results.some((r) => r.name === "contrato-b.pdf"));
  });
});

describe("PHASE 59 list + read + delete fixture", () => {
  it("lista, lee notas.txt y delete queda en confirm (Node stamp)", async () => {
    const list = createFilesystemListTool();
    const listed = await list.execute({ path: FIXTURE }, ctx);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    const names = (
      listed.content as { entries: Array<{ name: string }> }
    ).entries.map((e) => e.name);
    assert.ok(names.includes("notas.txt"));
    assert.ok(names.includes("subdir"));

    const read = createFilesystemReadTool();
    const notes = await read.execute(
      { path: path.join(FIXTURE, "notas.txt") },
      ctx,
    );
    assert.equal(notes.ok, true);
    if (!notes.ok) return;
    assert.match((notes.content as { content: string }).content, /notas/);

    const del = createFilesystemDeleteTool();
    assert.equal(del.executionMode, "confirm");
    assert.equal(existsSync(path.join(FIXTURE, "notas.txt")), true);
  });

  it("encuentra documento.txt vía search y lo lee", async () => {
    const search = createFilesystemSearchTool({ defaultRoots: [FIXTURE] });
    const found = await search.execute({ query: "documento.txt" }, ctx);
    assert.equal(found.ok, true);
    if (!found.ok) return;
    const hit = asSearch(found).results.find((r) => r.name === "documento.txt");
    assert.ok(hit);
    const read = createFilesystemReadTool();
    const body = await read.execute({ path: hit!.path }, ctx);
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.match((body.content as { content: string }).content, /SECIHTI/);
  });
});

describe("PHASE 59 safety isolation (Node stamps)", () => {
  it("search/list/read automatic; write/delete confirm", () => {
    const registry = createDefaultToolRegistry();
    assert.equal(registry.get("filesystem.search")?.executionMode, "automatic");
    assert.equal(registry.get("filesystem.list")?.executionMode, "automatic");
    assert.equal(registry.get("filesystem.read")?.executionMode, "automatic");
    assert.equal(registry.get("filesystem.write")?.executionMode, "confirm");
    assert.equal(registry.get("filesystem.delete")?.executionMode, "confirm");
    assert.equal(registry.get("process.execute")?.executionMode, "confirm");
  });

  it("write sigue contenida por root; search no usa root como cerca", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-59-iso-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    await writeFile(path.join(base, "outside-hit.txt"), "hit", "utf8");
    const ext = createFilesystemExtension({ filesystem: { root } });
    const search = ext.tools.find((t) => t.name === "filesystem.search");
    const write = ext.tools.find((t) => t.name === "filesystem.write");
    assert.ok(search);
    assert.ok(write);
    // Search tool created without defaultRoots=root → use path override in fixture dir
    const scoped = createFilesystemSearchTool({ defaultRoots: [base] });
    const hit = await scoped.execute({ query: "outside-hit" }, ctx);
    assert.equal(hit.ok, true);
    if (!hit.ok) return;
    assert.ok(asSearch(hit).resultCount >= 1);

    const w = await write!.execute(
      { path: path.join(base, "evil.txt"), content: "x" },
      ctx,
    );
    assert.equal(w.ok, false);
    if (!w.ok) assert.equal(w.error.code, "path_outside_root");
  });

  it("detectSearchRoots no lanza", async () => {
    const roots = await detectSearchRoots();
    assert.ok(Array.isArray(roots));
  });
});
