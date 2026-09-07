/**
 * PHASE 58 — user profile + conversation semantic metadata.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-58-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-phase58-onboarding!!!!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "p58.db");
process.env.PERSONAL_AGENT_ID = "phase58-agent-id";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const { mountIdentityHttp } = await import("../../src/http/identity-http.ts");
const {
  deriveConversationTitle,
  deriveConversationSummary,
  maybeAnnotateConversation,
} = await import("../../src/memory/conversation-meta.ts");
const { createConversation, getConversation } = await import(
  "../../src/memory/conversation-workspace.ts"
);

const HUB = process.env.HUB_TOKEN!;

describe("PHASE 58 first-run profile + conversation identity", () => {
  it("ensureLocalIdentity creates incomplete profile; PATCH completes name", async () => {
    const { user } = identity.ensureLocalIdentity();
    assert.equal(user.id, "local-user");
    assert.equal(identity.isUserProfileComplete(user), false);

    const app = new Hono();
    mountIdentityHttp(app, { hubToken: HUB });

    const get1 = await app.request("/v1/identity/me", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(get1.status, 200);
    const j1 = (await get1.json()) as {
      user: { name: string; profileCompleted: boolean };
    };
    assert.equal(j1.user.profileCompleted, false);

    const patch = await app.request("/v1/identity/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Enrique" }),
    });
    assert.equal(patch.status, 200);
    const j2 = (await patch.json()) as {
      user: { name: string; profileCompleted: boolean; id: string };
    };
    assert.equal(j2.user.name, "Enrique");
    assert.equal(j2.user.profileCompleted, true);
    assert.equal(j2.user.id, "local-user");

    const again = identity.ensureLocalIdentity();
    assert.equal(again.user.name, "Enrique");
    assert.equal(identity.isUserProfileComplete(again.user), true);
    assert.equal(again.created, false);
  });

  it("rejects reserved technical names", async () => {
    const app = new Hono();
    mountIdentityHttp(app, { hubToken: HUB });
    for (const name of ["local-user", "personal-agent", "  "]) {
      const res = await app.request("/v1/identity/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${HUB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      assert.equal(res.status, 400, name);
    }
  });

  it("deriveConversationTitle is human and never an id", () => {
    const title = deriveConversationTitle(
      "Quiero controlar tres drones con un guante mediante señales",
    );
    assert.match(title, /drones/i);
    assert.doesNotMatch(title, /^c_/);
    assert.doesNotMatch(title, /local-user/);
    assert.ok(title.length <= 60);

    const summary = deriveConversationSummary(
      "Quiero buscar doctorados en línea con beca en México para ingeniería.",
    );
    assert.match(summary, /doctorados/i);
    assert.doesNotMatch(summary, /^c_/);
  });

  it("maybeAnnotateConversation persists title/summary once", () => {
    const conv = createConversation({});
    assert.equal(conv.title, null);
    const annotated = maybeAnnotateConversation(
      conv.id,
      "Necesito un plan de trabajo remoto para perfil técnico",
    );
    assert.ok(annotated);
    assert.ok(annotated!.title);
    assert.ok(annotated!.summary);
    assert.doesNotMatch(annotated!.title!, /^c_/);

    const second = maybeAnnotateConversation(
      conv.id,
      "Otro mensaje que no debe sobrescribir el título",
    );
    assert.equal(second!.title, annotated!.title);
    assert.equal(second!.summary, annotated!.summary);

    const loaded = getConversation(conv.id);
    assert.equal(loaded!.title, annotated!.title);
    assert.equal(loaded!.summary, annotated!.summary);
  });
});
