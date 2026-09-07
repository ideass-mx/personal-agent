/**
 * PHASE 58.5 — pin / unpin / delete conversation (memory layer).
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listRecentConversations,
  setConversationPinned,
} from "../../src/memory/conversation-workspace.ts";
import { listConversationMessages } from "../../src/memory/history.ts";

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
    "014_conversation_pinned.sql",
  ]) {
    sql.exec(
      readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"),
    );
  }
  return sql;
}

describe("PHASE 58.5 conversation pin / delete", () => {
  it("create → pin → list order pinned first → unpin", () => {
    const sql = openDb();
    const older = createConversation({ title: "Antigua" }, sql);
    const newer = createConversation({ title: "Reciente" }, sql);
    sql
      .prepare(`UPDATE conversations SET created_at = ?, updated_at = ? WHERE id = ?`)
      .run("2026-01-01 00:00:00", "2026-01-01 00:00:00", older.id);
    sql
      .prepare(`UPDATE conversations SET created_at = ?, updated_at = ? WHERE id = ?`)
      .run("2026-01-03 00:00:00", "2026-01-03 00:00:00", newer.id);

    let listed = listRecentConversations(50, sql);
    assert.deepEqual(
      listed.map((c) => c.id),
      [newer.id, older.id],
    );
    assert.equal(listed.every((c) => c.pinned === false), true);

    const pinned = setConversationPinned(older.id, true, sql);
    assert.equal(pinned.pinned, true);
    assert.equal(getConversation(older.id, sql)?.pinned, true);

    listed = listRecentConversations(50, sql);
    assert.equal(listed[0]?.id, older.id);
    assert.equal(listed[0]?.pinned, true);
    assert.equal(listed[1]?.id, newer.id);
    assert.equal(listed[1]?.pinned, false);

    const unpinned = setConversationPinned(older.id, false, sql);
    assert.equal(unpinned.pinned, false);
    listed = listRecentConversations(50, sql);
    // unpin también toca updated_at → la recién desfijada queda arriba por actividad.
    assert.equal(listed.every((c) => c.pinned === false), true);
    assert.equal(listed[0]?.id, older.id);
    assert.equal(listed[1]?.id, newer.id);

    // Tras igualar updated_at, el orden vuelve a ser por timestamps base.
    sql
      .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
      .run("2026-01-01 00:00:00", older.id);
    sql
      .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
      .run("2026-01-03 00:00:00", newer.id);
    listed = listRecentConversations(50, sql);
    assert.deepEqual(
      listed.map((c) => c.id),
      [newer.id, older.id],
    );
  });

  it("delete cascade: messages gone; GET list omits conversation", () => {
    const sql = openDb();
    const c = createConversation({ title: "Borrar" }, sql);
    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'hola'), (?, ?, 'assistant', 'adiós')`,
      )
      .run("m1", c.id, "m2", c.id);
    assert.equal(listConversationMessages(c.id, sql).length, 2);

    const ok = deleteConversation(c.id, sql);
    assert.equal(ok, true);
    assert.equal(getConversation(c.id, sql), undefined);
    assert.equal(listConversationMessages(c.id, sql).length, 0);
    assert.equal(
      listRecentConversations(50, sql).some((row) => row.id === c.id),
      false,
    );
    assert.equal(deleteConversation(c.id, sql), false);
  });
});
