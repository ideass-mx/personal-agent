/**
 * PHASE 57.2 — Identity Foundation tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-id-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-compat-layer-32chars!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "identity.db");
process.env.PERSONAL_AGENT_ID = "install-agent-uuid-aaaa-bbbb-cccc";

const { runMigrations, db } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");

describe("PHASE 57.2 Identity Foundation", () => {
  it("creates local User and PersonalAgent on first ensure", () => {
    const first = identity.ensureLocalIdentity();
    assert.equal(first.user.id, identity.LOCAL_USER_ID);
    assert.equal(first.user.name, identity.DEFAULT_USER_DISPLAY_NAME);
    assert.equal(first.agent.id, "install-agent-uuid-aaaa-bbbb-cccc");
    assert.equal(first.agent.userId, first.user.id);
    assert.equal(first.created, true);
  });

  it("PersonalAgent belongs to User", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    assert.equal(agent.userId, user.id);
    const byUser = identity.getPersonalAgentByUserId(user.id);
    assert.ok(byUser);
    assert.equal(byUser!.id, agent.id);
  });

  it("UserContext carries userId and agentId", () => {
    const ctx = identity.resolveUserContext({
      sessionId: "ws_test",
      authKind: "install",
    });
    assert.equal(ctx.userId, identity.LOCAL_USER_ID);
    assert.equal(ctx.agentId, "install-agent-uuid-aaaa-bbbb-cccc");
    assert.equal(ctx.sessionId, "ws_test");
    assert.equal(ctx.authKind, "install_compat");
  });

  it("deviceId can exist independently on UserContext", () => {
    const ctx = identity.resolveUserContext({
      deviceId: "android-independent-1",
      authKind: "device",
    });
    assert.equal(ctx.deviceId, "android-independent-1");
    assert.equal(ctx.authKind, "device");
    assert.equal(ctx.userId, identity.LOCAL_USER_ID);
  });

  it("restart / re-ensure does not regenerate identity", () => {
    const a = identity.ensureLocalIdentity();
    const b = identity.ensureLocalIdentity();
    assert.equal(b.created, false);
    assert.equal(a.user.id, b.user.id);
    assert.equal(a.agent.id, b.agent.id);
    assert.equal(a.user.createdAt, b.user.createdAt);
    assert.equal(a.agent.createdAt, b.agent.createdAt);

    const users = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as {
      n: number;
    };
    const agents = db
      .prepare(`SELECT COUNT(*) AS n FROM personal_agents`)
      .get() as { n: number };
    assert.equal(users.n, 1);
    assert.equal(agents.n, 1);
  });

  it("HUB_TOKEN remains install_compat and is never userId", () => {
    const hubToken = process.env.HUB_TOKEN!;
    const ctx = identity.resolveUserContext({ authKind: "install" });
    assert.equal(ctx.authKind, "install_compat");
    assert.notEqual(ctx.userId, hubToken);
    assert.notEqual(ctx.agentId, hubToken);
    identity.assertHubTokenIsNotUserId(hubToken, ctx);
  });

  it("existing trusted device is annotated with userId/agentId", () => {
    // Simulate pre-migration device row without ownership (insert minimal).
    db.prepare(
      `INSERT INTO trusted_devices
         (device_id, name, platform, paired_at, last_seen, permissions, status, credential_hash)
       VALUES ('legacy-device-1', 'Legacy', 'android', datetime('now'), datetime('now'), '[]', 'ACTIVE', 'abc')`,
    ).run();

    const { user, agent } = identity.ensureLocalIdentity();
    const row = db
      .prepare(
        `SELECT user_id, agent_id FROM trusted_devices WHERE device_id = ?`,
      )
      .get("legacy-device-1") as { user_id: string; agent_id: string };
    assert.equal(row.user_id, user.id);
    assert.equal(row.agent_id, agent.id);
  });

  it("approve pairing attaches Device to User/PersonalAgent", () => {
    const s = pairing.createPairingSession();
    const accept = pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-new-pair",
      deviceName: "Phone",
      platform: "android",
    });
    assert.equal(accept.ok, true);
    const approved = pairing.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    const row = db
      .prepare(
        `SELECT user_id, agent_id, status FROM trusted_devices WHERE device_id = ?`,
      )
      .get("android-new-pair") as {
      user_id: string;
      agent_id: string;
      status: string;
    };
    assert.equal(row.status, "ACTIVE");
    assert.equal(row.user_id, identity.LOCAL_USER_ID);
    assert.equal(row.agent_id, "install-agent-uuid-aaaa-bbbb-cccc");
  });

  it("ids are not derived from OS username/hostname", () => {
    const { user, agent } = identity.ensureLocalIdentity();
    const osUser = process.env.USERNAME || process.env.USER || "";
    const host = os.hostname();
    assert.notEqual(user.id, osUser);
    assert.notEqual(agent.id, osUser);
    assert.notEqual(user.id, host);
    assert.notEqual(agent.id, host);
    assert.equal(user.id, "local-user");
  });
});
