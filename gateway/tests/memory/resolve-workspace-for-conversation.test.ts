import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createConversation } from "../../src/memory/conversation-workspace.ts";
import { resolveWorkspaceForConversation } from "../../src/memory/resolve-workspace-for-conversation.ts";
import { createSqliteWorkspaceStore } from "../../src/workspace/sqlite-workspace-store.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function openDb() {
  const sql = new Database(":memory:");
  sql.pragma("foreign_keys = ON");
  for (const name of [
    "001_init.sql",
    "002_workspaces.sql",
    "003_conversation_workspace.sql",
  ]) {
    sql.exec(
      readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"),
    );
  }
  return sql;
}

describe("resolveWorkspaceForConversation", () => {
  it("casual → null; no inventa Workspace", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    store.createWorkspace({ name: "otro" });
    const c = createConversation({}, sql);
    assert.equal(resolveWorkspaceForConversation(c.id, store, sql), null);
  });

  it("Conversation con Workspace → el Workspace correcto", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const w = store.createWorkspace({ name: "Libro" });
    const c = createConversation({ workspaceId: w.id }, sql);
    const resolved = resolveWorkspaceForConversation(c.id, store, sql);
    assert.equal(resolved?.id, w.id);
    assert.equal(resolved?.name, "Libro");
  });

  it("dos Conversations al mismo Workspace; A/B/C independientes", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const wa = store.createWorkspace({ name: "A" });
    const wb = store.createWorkspace({ name: "B" });
    const c1 = createConversation({ workspaceId: wa.id }, sql);
    const c2 = createConversation({ workspaceId: wa.id }, sql);
    const cA = createConversation({ workspaceId: wa.id }, sql);
    const cB = createConversation({ workspaceId: wb.id }, sql);
    const cC = createConversation({}, sql);
    assert.equal(resolveWorkspaceForConversation(c1.id, store, sql)?.id, wa.id);
    assert.equal(resolveWorkspaceForConversation(c2.id, store, sql)?.id, wa.id);
    assert.equal(resolveWorkspaceForConversation(cA.id, store, sql)?.id, wa.id);
    assert.equal(resolveWorkspaceForConversation(cB.id, store, sql)?.id, wb.id);
    assert.equal(resolveWorkspaceForConversation(cC.id, store, sql), null);
  });

  it("tras delete Workspace → null (SET NULL)", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const w = store.createWorkspace({ name: "tmp" });
    const c = createConversation({ workspaceId: w.id }, sql);
    store.deleteWorkspace(w.id);
    assert.equal(resolveWorkspaceForConversation(c.id, store, sql), null);
  });

  it("continuidad entre Session A y Session B: mismo conversationId", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const w = store.createWorkspace({ name: "Libro" });
    const c = createConversation({ workspaceId: w.id }, sql);
    const fromSessionA = resolveWorkspaceForConversation(c.id, store, sql);
    const fromSessionB = resolveWorkspaceForConversation(c.id, store, sql);
    assert.equal(fromSessionA?.id, w.id);
    assert.equal(fromSessionB?.id, w.id);
    assert.equal(fromSessionA?.id, fromSessionB?.id);
  });

  it("Conversation inexistente y referencia inconsistente: error explícito", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    assert.throws(
      () => resolveWorkspaceForConversation("c_missing", store, sql),
      /Conversation inexistente/,
    );
    sql.pragma("foreign_keys = OFF");
    sql.prepare("INSERT INTO conversations (id, workspace_id) VALUES (?, ?)").run(
      "c_orphan",
      "w_gone",
    );
    sql.pragma("foreign_keys = ON");
    assert.throws(
      () => resolveWorkspaceForConversation("c_orphan", store, sql),
      /Workspace inconsistente/,
    );
  });
});
