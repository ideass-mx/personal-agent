import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createConversation,
  getConversation,
  listConversationsByWorkspace,
  setConversationWorkspace,
} from "../../src/memory/conversation-workspace.ts";
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
    "012_user_profile_conversation_meta.sql",
  ]) {
    sql.exec(
      readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"),
    );
  }
  return sql;
}

describe("Conversation → Workspace (opcional)", () => {
  it("conversación casual sin Workspace", () => {
    const sql = openDb();
    const c = createConversation({}, sql);
    assert.match(c.id, /^c_/);
    assert.equal(c.workspaceId, null);
    assert.equal(getConversation(c.id, sql)?.workspaceId, null);
  });

  it("ensureConversation-style INSERT deja workspace_id NULL", () => {
    const sql = openDb();
    sql.prepare("INSERT INTO conversations (id) VALUES (?)").run("c_casual");
    assert.equal(getConversation("c_casual", sql)?.workspaceId, null);
  });

  it("crear con Workspace y recuperar workspace_id", () => {
    const sql = openDb();
    const w = createSqliteWorkspaceStore(sql).createWorkspace({ name: "Libro" });
    const c = createConversation({ workspaceId: w.id }, sql);
    assert.equal(c.workspaceId, w.id);
    assert.equal(getConversation(c.id, sql)?.workspaceId, w.id);
  });

  it("cambiar y desvincular Workspace", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const a = store.createWorkspace({ name: "A" });
    const b = store.createWorkspace({ name: "B" });
    const c = createConversation({ workspaceId: a.id }, sql);
    assert.equal(setConversationWorkspace(c.id, b.id, sql).workspaceId, b.id);
    assert.equal(setConversationWorkspace(c.id, null, sql).workspaceId, null);
  });

  it("Workspace inexistente produce error claro", () => {
    const sql = openDb();
    assert.throws(
      () => createConversation({ workspaceId: "w_nope" }, sql),
      /Workspace inexistente/,
    );
    const c = createConversation({}, sql);
    assert.throws(
      () => setConversationWorkspace(c.id, "w_nope", sql),
      /Workspace inexistente/,
    );
  });

  it("eliminar Workspace no borra Conversation ni messages (SET NULL)", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const w = store.createWorkspace({ name: "tmp" });
    const c = createConversation({ workspaceId: w.id }, sql);
    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'hola')`,
      )
      .run("m_1", c.id);
    assert.equal(store.deleteWorkspace(w.id), true);
    assert.equal(getConversation(c.id, sql)?.workspaceId, null);
    const msg = sql
      .prepare(`SELECT content FROM messages WHERE id = ?`)
      .get("m_1") as { content: string };
    assert.equal(msg.content, "hola");
    assert.ok(store.getWorkspace(w.id) === undefined);
  });

  it("lista por Workspace: aislamiento, NULL excluido, orden, SET NULL", () => {
    const sql = openDb();
    const store = createSqliteWorkspaceStore(sql);
    const a = store.createWorkspace({ name: "A" });
    const b = store.createWorkspace({ name: "B" });
    const c1 = createConversation({ workspaceId: a.id, title: "c1" }, sql);
    const c2 = createConversation({ workspaceId: a.id, title: "c2" }, sql);
    const c3 = createConversation({ workspaceId: b.id, title: "c3" }, sql);
    const c4 = createConversation({ title: "casual" }, sql);
    sql.prepare(`UPDATE conversations SET created_at = ? WHERE id = ?`).run("2026-01-01 00:00:00", c1.id);
    sql.prepare(`UPDATE conversations SET created_at = ? WHERE id = ?`).run("2026-01-02 00:00:00", c2.id);
    const listedA = listConversationsByWorkspace(a.id, sql);
    assert.deepEqual(listedA.map((c) => c.id), [c2.id, c1.id]);
    assert.equal(listedA.every((c) => c.workspaceId === a.id), true);
    const listedB = listConversationsByWorkspace(b.id, sql);
    assert.deepEqual(listedB.map((c) => c.id), [c3.id]);
    assert.equal(
      listConversationsByWorkspace(a.id, sql).some((c) => c.id === c4.id),
      false,
    );
    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'keep')`,
      )
      .run("m_keep_list", c1.id);
    assert.equal(store.deleteWorkspace(a.id), true);
    assert.equal(getConversation(c1.id, sql)?.workspaceId, null);
    assert.equal(listConversationsByWorkspace(a.id, sql).length, 0);
    const msg = sql
      .prepare(`SELECT content FROM messages WHERE id = ?`)
      .get("m_keep_list") as { content: string };
    assert.equal(msg.content, "keep");
  });
});
