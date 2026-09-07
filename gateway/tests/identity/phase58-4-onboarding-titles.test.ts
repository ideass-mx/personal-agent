/**
 * PHASE 58.4 — Onboarding gates, semantic titles, list endpoint, composer layout.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-584-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-phase584-onboarding!!!!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "p584.db");
process.env.PERSONAL_AGENT_ID = "phase584-agent-id";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const { mountIdentityHttp } = await import("../../src/http/identity-http.ts");
const {
  deriveConversationTitle,
  deriveConversationSummary,
  maybeAnnotateConversation,
  maybeAnnotateConversationAsync,
  isPlaceholderTitle,
  sanitizeGeneratedTitle,
  parseMetaLlmResponse,
  conversationNeedsAnnotation,
} = await import("../../src/memory/conversation-meta.ts");
const {
  createConversation,
  getConversation,
  listRecentConversations,
} = await import("../../src/memory/conversation-workspace.ts");
const { mountWorkspaceHttp } = await import("../../src/http/workspace-http.ts");
const { createSqliteWorkspaceStore } = await import(
  "../../src/workspace/sqlite-workspace-store.ts"
);
const { db } = await import("../../src/db/database.ts");

const HUB = process.env.HUB_TOKEN!;

describe("PHASE 58.4 onboarding identity gates", () => {
  it("nombre ausente → profile incomplete even if identity row exists", () => {
    const { user } = identity.ensureLocalIdentity();
    assert.equal(identity.isUserProfileComplete(user), false);
    assert.equal(user.profileCompleted, false);
  });

  it("nombre persistido + profileCompleted; READY sin nombre no completa perfil", async () => {
    const app = new Hono();
    mountIdentityHttp(app, { hubToken: HUB });

    const before = await app.request("/v1/identity/me", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(before.status, 200);
    const j0 = (await before.json()) as {
      user: { profileCompleted: boolean };
    };
    assert.equal(j0.user.profileCompleted, false);

    const patch = await app.request("/v1/identity/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Enrique" }),
    });
    assert.equal(patch.status, 200);
    const j1 = (await patch.json()) as {
      user: { name: string; profileCompleted: boolean };
    };
    assert.equal(j1.user.name, "Enrique");
    assert.equal(j1.user.profileCompleted, true);
    assert.equal(
      identity.isUserProfileComplete(identity.ensureLocalIdentity().user),
      true,
    );
  });
});

describe("PHASE 58.4 conversation semantic title/summary", () => {
  it("placeholder title detection", () => {
    assert.equal(isPlaceholderTitle(null), true);
    assert.equal(isPlaceholderTitle(""), true);
    assert.equal(isPlaceholderTitle("Nueva conversación"), true);
    assert.equal(isPlaceholderTitle("Comparación de NVIDIA"), false);
  });

  it("sanitize rejects technical ids and clamps to 60", () => {
    assert.equal(sanitizeGeneratedTitle("c_01f9abcd-ffff"), null);
    assert.equal(sanitizeGeneratedTitle("conv_abc"), null);
    const long = "A".repeat(80);
    const clamped = sanitizeGeneratedTitle(long);
    assert.ok(clamped);
    assert.ok(clamped!.length <= 60);
  });

  it("parseMetaLlmResponse reads JSON title/summary", () => {
    const parsed = parseMetaLlmResponse(
      `{"title":"Configuración de Docker en Windows 11","summary":"El usuario quiere instalar Docker en Windows 11."}`,
    );
    assert.equal(parsed.title, "Configuración de Docker en Windows 11");
    assert.match(parsed.summary ?? "", /Docker/);
  });

  it("nueva conversación → annotate once; no overwrite", () => {
    const conv = createConversation({});
    assert.equal(conv.title, null);
    assert.equal(conversationNeedsAnnotation(conv), true);

    const annotated = maybeAnnotateConversation(
      conv.id,
      "Necesito comparar NVIDIA, Microsoft y Google para decidir dónde invertir.",
    );
    assert.ok(annotated?.title);
    assert.ok(annotated!.title!.length <= 60);
    assert.doesNotMatch(annotated!.title!, /^c_/);
    assert.ok(annotated!.summary);

    const second = maybeAnnotateConversation(
      conv.id,
      "Otro mensaje que no debe regenerar el título",
    );
    assert.equal(second!.title, annotated!.title);
    assert.equal(second!.summary, annotated!.summary);
  });

  it("async annotate falls back when LLM unavailable and never throws", async () => {
    const conv = createConversation({});
    const annotated = await maybeAnnotateConversationAsync(
      conv.id,
      "Quiero configurar Docker en Windows 11.",
    );
    assert.ok(annotated?.title);
    assert.match(annotated!.title!, /Docker/i);
    assert.ok(annotated!.title!.length <= 60);
    assert.ok(annotated!.summary);

    const loaded = getConversation(conv.id);
    assert.equal(loaded!.title, annotated!.title);
  });

  it("listRecentConversations includes casual threads with titles", () => {
    const a = createConversation({});
    maybeAnnotateConversation(a.id, "Presentación sobre inteligencia artificial.");
    const listed = listRecentConversations(20);
    const found = listed.find((c) => c.id === a.id);
    assert.ok(found);
    assert.ok(found!.title);
    assert.doesNotMatch(found!.title!, /^c_/);
  });

  it("GET /conversations returns casual + workspace conversations", async () => {
    const workspaces = createSqliteWorkspaceStore(db as never);
    const app = new Hono();
    mountWorkspaceHttp(app, {
      workspaces,
      hubToken: HUB,
      sql: db as never,
    });
    const casual = createConversation({});
    maybeAnnotateConversation(
      casual.id,
      "Necesito hacer una presentación sobre inteligencia artificial.",
    );
    const res = await app.request("/conversations?limit=50", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{ id: string; title: string | null }>;
    assert.ok(list.some((c) => c.id === casual.id && c.title));
  });

  it("derive helpers stay human and bounded", () => {
    const title = deriveConversationTitle(
      "Quiero controlar tres drones con un guante mediante señales",
    );
    assert.match(title, /drones/i);
    assert.ok(title.length <= 60);
    const summary = deriveConversationSummary(
      "Quiero buscar doctorados en línea con beca en México para ingeniería.",
    );
    assert.match(summary, /doctorados/i);
  });

  it("full path: annotate persists useful title + summary and GET /conversations returns it", async () => {
    const workspaces = createSqliteWorkspaceStore(db as never);
    const app = new Hono();
    mountWorkspaceHttp(app, {
      workspaces,
      hubToken: HUB,
      sql: db as never,
    });

    const conv = createConversation({});
    const userMsg =
      "Quiero comparar NVIDIA, Microsoft y Google como inversión para los próximos 12 meses.";
    await maybeAnnotateConversationAsync(conv.id, userMsg);

    const loaded = getConversation(conv.id);
    assert.ok(loaded?.title);
    assert.notEqual(loaded!.title!.trim().toLowerCase(), "nueva conversación");
    assert.match(loaded!.title!, /NVIDIA|Microsoft|Google|compar|invers/i);
    assert.ok(loaded!.summary?.trim());

    const res = await app.request("/conversations?limit=50", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{
      id: string;
      title: string | null;
      summary?: string | null;
    }>;
    const row = list.find((c) => c.id === conv.id);
    assert.ok(row);
    assert.equal(row!.title, loaded!.title);
    assert.notEqual(row!.title!.trim().toLowerCase(), "nueva conversación");
    assert.match(row!.title!, /NVIDIA|Microsoft|Google|compar|invers/i);
    if (row!.summary !== undefined) {
      assert.ok(row!.summary?.trim());
    }
  });

  it("fallback useful title for Docker/Windows message", async () => {
    const conv = createConversation({});
    await maybeAnnotateConversationAsync(
      conv.id,
      "Quiero configurar Docker en Windows 11",
    );
    const loaded = getConversation(conv.id);
    assert.ok(loaded?.title);
    assert.match(loaded!.title!, /Docker/i);
    assert.notEqual(loaded!.title!.trim().toLowerCase(), "nueva conversación");
  });

  it("immediate seed persists non-placeholder title when LLM unavailable", async () => {
    const conv = createConversation({});
    const pending = maybeAnnotateConversationAsync(
      conv.id,
      "Quiero montar un laboratorio de redes con Wireshark",
    );
    // Seed writes sync before the first await (LLM); title must already exist.
    const early = getConversation(conv.id);
    assert.ok(early?.title?.trim());
    assert.notEqual(early!.title!.trim().toLowerCase(), "nueva conversación");
    assert.ok(early!.summary?.trim());
    await pending;
    const final = getConversation(conv.id);
    assert.ok(final?.title?.trim());
    assert.notEqual(final!.title!.trim().toLowerCase(), "nueva conversación");
  });
});