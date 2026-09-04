import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createSqliteWorkspaceStore } from "../../src/workspace/sqlite-workspace-store.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function openStore() {
  const sql = new Database(":memory:");
  sql.exec(
    readFileSync(
      path.join(repoRoot, "db/migrations/002_workspaces.sql"),
      "utf8",
    ),
  );
  return { sql, store: createSqliteWorkspaceStore(sql) };
}

describe("SqliteWorkspaceStore", () => {
  it("crear, obtener y listar", () => {
    const { store } = openStore();
    const created = store.createWorkspace({
      name: " Libro ",
      description: " borrador ",
    });
    assert.match(created.id, /^w_/);
    assert.equal(created.name, "Libro");
    assert.equal(created.description, "borrador");
    assert.ok(created.createdAt);
    assert.equal(store.getWorkspace(created.id)?.name, "Libro");
    assert.equal(store.listWorkspaces().length, 1);
  });

  it("Workspace inexistente", () => {
    const { store } = openStore();
    assert.equal(store.getWorkspace("w_missing"), undefined);
    assert.equal(
      store.updateWorkspace("w_missing", { name: "x" }),
      undefined,
    );
    assert.equal(store.deleteWorkspace("w_missing"), false);
  });

  it("actualizar y persistir entre adapters", () => {
    const { sql, store } = openStore();
    const w = store.createWorkspace({ name: "A" });
    const updated = store.updateWorkspace(w.id, {
      name: "B",
      description: "notas",
    });
    assert.equal(updated?.name, "B");
    assert.equal(updated?.description, "notas");
    const other = createSqliteWorkspaceStore(sql);
    assert.equal(other.getWorkspace(w.id)?.name, "B");
  });

  it("deleteWorkspace quita la fila; Conversations no se tocan", () => {
    const { store } = openStore();
    const w = store.createWorkspace({ name: "tmp" });
    assert.equal(store.deleteWorkspace(w.id), true);
    assert.equal(store.getWorkspace(w.id), undefined);
  });

  it("name vacío falla", () => {
    const { store } = openStore();
    assert.throws(() => store.createWorkspace({ name: "   " }), /name/);
  });
});
