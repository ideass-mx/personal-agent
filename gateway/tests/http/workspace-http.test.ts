import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createConversation } from "../../src/memory/conversation-workspace.ts";
import { mountWorkspaceHttp } from "../../src/http/workspace-http.ts";
import { createSqliteWorkspaceStore } from "../../src/workspace/sqlite-workspace-store.ts";
import { listConversationMessages } from "../../src/memory/history.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const TOKEN = "phase16-test-token";

function openDb(file = ":memory:") {
  const sql = new Database(file);
  sql.pragma("foreign_keys = ON");
  for (const name of [
    "001_init.sql",
    "002_workspaces.sql",
    "003_conversation_workspace.sql",
  ]) {
    sql.exec(readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"));
  }
  return sql;
}

function appFor(sql: Database.Database) {
  const workspaces = createSqliteWorkspaceStore(sql);
  const app = new Hono();
  mountWorkspaceHttp(app, { workspaces, hubToken: TOKEN, sql });
  return { app, workspaces };
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

describe("HTTP Workspace (Gateway)", () => {
  it("401 sin token; CRUD create/list/get/update", async () => {
    const sql = openDb();
    const { app } = appFor(sql);
    const unauth = await app.request("/workspaces");
    assert.equal(unauth.status, 401);
    const created = await app.request("/workspaces", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ name: " Libro ", description: "ms" }),
    });
    assert.equal(created.status, 201);
    const w = (await created.json()) as { id: string; name: string };
    assert.equal(w.name, "Libro");
    assert.match(w.id, /^w_/);
    const listed = await app.request("/workspaces", { headers: authHeaders() });
    assert.equal(listed.status, 200);
    const listBody = (await listed.json()) as { workspaces: { id: string }[] };
    assert.equal(listBody.workspaces.length, 1);
    const got = await app.request(`/workspaces/${w.id}`, {
      headers: authHeaders(),
    });
    assert.equal(got.status, 200);
    const patched = await app.request(`/workspaces/${w.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ name: "Libro v2" }),
    });
    assert.equal(patched.status, 200);
    const updated = (await patched.json()) as { name: string };
    assert.equal(updated.name, "Libro v2");
  });

  it("casos A–F: casual, asociar, cambiar, quitar, delete SET NULL, inválido", async () => {
    const sql = openDb();
    const { app, workspaces } = appFor(sql);
    const w1 = workspaces.createWorkspace({ name: "W1" });
    const w2 = workspaces.createWorkspace({ name: "W2" });
    const casual = createConversation({}, sql);

    const a = await app.request(`/conversations/${casual.id}/workspace`, {
      headers: authHeaders(),
    });
    assert.equal(a.status, 200);
    const aBody = (await a.json()) as { workspace: unknown };
    assert.equal(aBody.workspace, null);

    const assoc = await app.request(`/conversations/${casual.id}/workspace`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: w1.id }),
    });
    assert.equal(assoc.status, 200);
    const bBody = (await assoc.json()) as {
      workspace: { id: string };
      conversation: { workspaceId: string };
    };
    assert.equal(bBody.workspace.id, w1.id);
    assert.equal(bBody.conversation.workspaceId, w1.id);

    const change = await app.request(`/conversations/${casual.id}/workspace`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: w2.id }),
    });
    assert.equal(change.status, 200);
    const cBody = (await change.json()) as { workspace: { id: string } };
    assert.equal(cBody.workspace.id, w2.id);

    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'hola')`,
      )
      .run("m_keep", casual.id);

    const gone = await app.request(`/workspaces/${w2.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assert.equal(gone.status, 200);
    const afterDel = await app.request(
      `/conversations/${casual.id}/workspace`,
      { headers: authHeaders() },
    );
    const eBody = (await afterDel.json()) as { workspace: unknown };
    assert.equal(eBody.workspace, null);
    const msg = sql
      .prepare(`SELECT content FROM messages WHERE id = ?`)
      .get("m_keep") as { content: string };
    assert.equal(msg.content, "hola");

    const again = createConversation({}, sql);
    const linked = await app.request(`/conversations/${again.id}/workspace`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: w1.id }),
    });
    assert.equal(linked.status, 200);
    const drop = await app.request(`/conversations/${again.id}/workspace`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: null }),
    });
    assert.equal(drop.status, 200);
    const dBody = (await drop.json()) as { workspace: unknown };
    assert.equal(dBody.workspace, null);

    const bad = await app.request(`/conversations/${again.id}/workspace`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: "w_nope" }),
    });
    assert.equal(bad.status, 404);
    const missingConv = await app.request(
      `/conversations/c_missing/workspace`,
      {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ workspaceId: w1.id }),
      },
    );
    assert.equal(missingConv.status, 404);
  });

  it("persistencia en archivo tras reabrir SQLite", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pa-ws-"));
    const file = path.join(dir, "t.db");
    try {
      const sql1 = openDb(file);
      const store1 = createSqliteWorkspaceStore(sql1);
      const w = store1.createWorkspace({ name: "Persistente" });
      const c = createConversation({ workspaceId: w.id }, sql1);
      sql1.close();
      const sql2 = new Database(file);
      sql2.pragma("foreign_keys = ON");
      const store2 = createSqliteWorkspaceStore(sql2);
      assert.equal(store2.getWorkspace(w.id)?.name, "Persistente");
      const { app } = appFor(sql2);
      const res = await app.request(`/conversations/${c.id}/workspace`, {
        headers: authHeaders(),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { workspace: { id: string } };
      assert.equal(body.workspace.id, w.id);
      sql2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("POST /conversations: casual, en Workspace, 404, dos hilos, primer mensaje, DELETE SET NULL", async () => {
    const sql = openDb();
    const { app, workspaces } = appFor(sql);
    const wx = workspaces.createWorkspace({ name: "X" });
    const wy = workspaces.createWorkspace({ name: "Y" });

    const casualRes = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: null, title: "Casual" }),
    });
    assert.equal(casualRes.status, 201);
    const casual = (await casualRes.json()) as { id: string; workspaceId: string | null };
    assert.equal(casual.workspaceId, null);

    const omitted = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({}),
    });
    assert.equal(omitted.status, 201);
    const omittedBody = (await omitted.json()) as { workspaceId: string | null };
    assert.equal(omittedBody.workspaceId, null);

    const inX = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: wx.id, title: "En X" }),
    });
    assert.equal(inX.status, 201);
    const b = (await inX.json()) as { id: string; workspaceId: string };
    assert.equal(b.workspaceId, wx.id);

    const missing = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: "w_nope" }),
    });
    assert.equal(missing.status, 404);

    const alsoX = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: wx.id }),
    });
    const b2 = (await alsoX.json()) as { id: string; workspaceId: string };
    assert.equal(b2.workspaceId, wx.id);
    assert.notEqual(b2.id, b.id);

    const inY = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: wy.id }),
    });
    const cY = (await inY.json()) as { id: string; workspaceId: string };
    assert.equal(cY.workspaceId, wy.id);

    const stillB = await app.request(`/conversations/${b.id}`, {
      headers: authHeaders(),
    });
    const stillBody = (await stillB.json()) as { workspaceId: string };
    assert.equal(stillBody.workspaceId, wx.id);

    const fromXCasual = await app.request("/conversations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ workspaceId: null }),
    });
    const fromX = (await fromXCasual.json()) as { workspaceId: string | null };
    assert.equal(fromX.workspaceId, null);

    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'primer')`,
      )
      .run("m_b", b.id);
    const msg = sql
      .prepare(`SELECT conversation_id FROM messages WHERE id = ?`)
      .get("m_b") as { conversation_id: string };
    assert.equal(msg.conversation_id, b.id);
    const afterMsg = await app.request(`/conversations/${b.id}`, {
      headers: authHeaders(),
    });
    assert.equal(((await afterMsg.json()) as { workspaceId: string }).workspaceId, wx.id);

    const del = await app.request(`/workspaces/${wx.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assert.equal(del.status, 200);
    const afterDel = await app.request(`/conversations/${b.id}`, {
      headers: authHeaders(),
    });
    assert.equal(((await afterDel.json()) as { workspaceId: null }).workspaceId, null);
    const msgStill = sql
      .prepare(`SELECT id FROM messages WHERE id = ?`)
      .get("m_b") as { id: string };
    assert.equal(msgStill.id, "m_b");
  });

  it("GET /workspaces/:id/conversations: 401, 404, vacío, aislamiento, orden, DELETE", async () => {
    const sql = openDb();
    const { app, workspaces } = appFor(sql);
    const unauth = await app.request("/workspaces/w_x/conversations");
    assert.equal(unauth.status, 401);
    const badTok = await app.request("/workspaces/w_x/conversations", {
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(badTok.status, 401);
    const missing = await app.request("/workspaces/w_nope/conversations", {
      headers: authHeaders(),
    });
    assert.equal(missing.status, 404);

    const wa = workspaces.createWorkspace({ name: "A" });
    const wb = workspaces.createWorkspace({ name: "B" });
    const empty = await app.request(`/workspaces/${wa.id}/conversations`, {
      headers: authHeaders(),
    });
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), []);

    const c1 = createConversation({ workspaceId: wa.id, title: "uno" }, sql);
    const c2 = createConversation({ workspaceId: wa.id, title: "dos" }, sql);
    const c3 = createConversation({ workspaceId: wb.id, title: "tres" }, sql);
    createConversation({ title: "casual" }, sql);
    sql.prepare(`UPDATE conversations SET created_at = ? WHERE id = ?`).run("2026-01-01 00:00:00", c1.id);
    sql.prepare(`UPDATE conversations SET created_at = ? WHERE id = ?`).run("2026-01-03 00:00:00", c2.id);

    const listed = await app.request(`/workspaces/${wa.id}/conversations`, {
      headers: authHeaders(),
    });
    assert.equal(listed.status, 200);
    const rows = (await listed.json()) as { id: string; workspaceId: string }[];
    assert.deepEqual(rows.map((r) => r.id), [c2.id, c1.id]);
    assert.equal(rows.some((r) => r.id === c3.id), false);
    assert.equal(rows.every((r) => r.workspaceId === wa.id), true);

    const gone = await app.request(`/workspaces/${wa.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assert.equal(gone.status, 200);
    const after = await app.request(`/workspaces/${wa.id}/conversations`, {
      headers: authHeaders(),
    });
    assert.equal(after.status, 404);
    const still = await app.request(`/conversations/${c1.id}`, {
      headers: authHeaders(),
    });
    assert.equal(((await still.json()) as { workspaceId: null }).workspaceId, null);
  });
});

function openDbWithPinned(file = ":memory:") {
  const sql = new Database(file);
  sql.pragma("foreign_keys = ON");
  for (const name of [
    "001_init.sql",
    "002_workspaces.sql",
    "003_conversation_workspace.sql",
    "012_user_profile_conversation_meta.sql",
    "014_conversation_pinned.sql",
  ]) {
    sql.exec(readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"));
  }
  return sql;
}

describe("HTTP Workspace — PHASE 58.5 pin / delete", () => {
  it("PATCH /conversations/:id {pinned} and DELETE cascade", async () => {
    const sql = openDbWithPinned();
    const { app } = appFor(sql);
    const a = createConversation({ title: "A" }, sql);
    const b = createConversation({ title: "B" }, sql);
    sql
      .prepare(`UPDATE conversations SET created_at = ?, updated_at = ? WHERE id = ?`)
      .run("2026-01-01 00:00:00", "2026-01-01 00:00:00", a.id);
    sql
      .prepare(`UPDATE conversations SET created_at = ?, updated_at = ? WHERE id = ?`)
      .run("2026-01-03 00:00:00", "2026-01-03 00:00:00", b.id);

    const unauth = await app.request(`/conversations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    assert.equal(unauth.status, 401);

    const bad = await app.request(`/conversations/${a.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({}),
    });
    assert.equal(bad.status, 400);

    const missing = await app.request(`/conversations/c_nope`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ pinned: true }),
    });
    assert.equal(missing.status, 404);

    const pinnedRes = await app.request(`/conversations/${a.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ pinned: true }),
    });
    assert.equal(pinnedRes.status, 200);
    const pinnedBody = (await pinnedRes.json()) as {
      id: string;
      pinned: boolean;
    };
    assert.equal(pinnedBody.id, a.id);
    assert.equal(pinnedBody.pinned, true);

    const listed = await app.request("/conversations?limit=50", {
      headers: authHeaders(),
    });
    assert.equal(listed.status, 200);
    const rows = (await listed.json()) as Array<{
      id: string;
      pinned: boolean;
    }>;
    assert.equal(rows[0]?.id, a.id);
    assert.equal(rows[0]?.pinned, true);
    assert.equal(rows[1]?.id, b.id);
    assert.equal(rows[1]?.pinned, false);

    const unpin = await app.request(`/conversations/${a.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ pinned: false }),
    });
    assert.equal(unpin.status, 200);
    assert.equal(((await unpin.json()) as { pinned: boolean }).pinned, false);

    sql
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES (?, ?, 'user', 'x')`,
      )
      .run("m_del", a.id);
    assert.equal(listConversationMessages(a.id, sql).length, 1);

    const del = await app.request(`/conversations/${a.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assert.equal(del.status, 200);
    assert.deepEqual(await del.json(), { ok: true });
    assert.equal(listConversationMessages(a.id, sql).length, 0);

    const gone = await app.request(`/conversations/${a.id}`, {
      headers: authHeaders(),
    });
    assert.equal(gone.status, 404);

    const delAgain = await app.request(`/conversations/${a.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assert.equal(delAgain.status, 404);

    const after = await app.request("/conversations?limit=50", {
      headers: authHeaders(),
    });
    const afterRows = (await after.json()) as Array<{ id: string }>;
    assert.equal(afterRows.some((r) => r.id === a.id), false);
    assert.equal(afterRows.some((r) => r.id === b.id), true);
  });
});
