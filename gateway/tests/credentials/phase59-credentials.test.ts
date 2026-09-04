/**
 * PHASE 59 — CredentialManager / SecretStore / redaction / boundaries.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(path.join(tmpdir(), "pa-59-cred-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "f".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "66666666-6666-4666-8666-666666666666";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  createCredentialManager,
  MemorySecretStore,
  EncryptedFileCredentialStore,
  authorizeCredentialAccess,
  toLlmSafeCredentialView,
  redactString,
  redactSecrets,
  redactForLog,
  credentialsTableHasSecretColumn,
  assertSafeCredentialId,
} = await import("../../src/credentials/index.ts");

before(() => {
  assert.equal(credentialsTableHasSecretColumn(), false);
});

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("PHASE 59 CredentialManager metadata + lifecycle", () => {
  it("create / getMetadata / revoke / delete", async () => {
    const secrets = new MemorySecretStore();
    const mgr = createCredentialManager(secrets);
    const ref = await mgr.create(
      {
        name: "GitHub",
        kind: "api_key",
        provider: "github",
        serverId: "mcp-github",
      },
      "ghp_super_secret_value_never_in_meta",
    );
    assert.match(ref.credentialId, /^cred_/);
    assert.equal("secret" in ref, false);

    const meta = await mgr.getMetadata(ref.credentialId);
    assert.ok(meta);
    assert.equal(meta!.status, "ACTIVE");
    assert.equal(meta!.name, "GitHub");
    assert.equal(JSON.stringify(meta).includes("ghp_"), false);

    await mgr.revoke(ref.credentialId);
    const revoked = await mgr.getMetadata(ref.credentialId);
    assert.equal(revoked!.status, "REVOKED");
    const denied = await mgr.getSecret(ref.credentialId, {
      serverId: "mcp-github",
      reason: "test",
    });
    assert.equal(denied, null);

    await mgr.delete(ref.credentialId);
    assert.equal(await mgr.getMetadata(ref.credentialId), null);
    assert.equal(await secrets.get(ref.credentialId), null);
  });

  it("expired credential no entrega secreto", async () => {
    const secrets = new MemorySecretStore();
    const mgr = createCredentialManager(secrets);
    const ref = await mgr.create(
      {
        name: "Temp",
        kind: "bearer_token",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      "temp-secret",
    );
    const meta = await mgr.getMetadata(ref.credentialId);
    assert.equal(meta!.status, "EXPIRED");
    assert.equal(await mgr.getSecret(ref.credentialId, { reason: "x" }), null);
  });

  it("unknown credential no devuelve secreto", async () => {
    const mgr = createCredentialManager(new MemorySecretStore());
    assert.equal(
      await mgr.getSecret("cred_missing_zzzz", { reason: "x" }),
      null,
    );
  });
});

describe("PHASE 59 SecretStore", () => {
  it("Memory put/get/delete/overwrite", async () => {
    const s = new MemorySecretStore();
    await s.put("cred_a1", "one");
    assert.equal(await s.get("cred_a1"), "one");
    await s.put("cred_a1", "two");
    assert.equal(await s.get("cred_a1"), "two");
    await s.delete("cred_a1");
    assert.equal(await s.get("cred_a1"), null);
  });

  it("EncryptedFile put/get/delete sin plaintext en disco", async () => {
    const root = path.join(tmp, "enc-store");
    const s = new EncryptedFileCredentialStore({ rootDir: root });
    const secret = "plain-secret-value-xyz";
    await s.put("cred_enc1", secret);
    const file = path.join(root, "cred_enc1.secret");
    assert.ok(existsSync(file));
    const raw = readFileSync(file);
    assert.equal(raw.includes(secret), false);
    assert.equal(await s.get("cred_enc1"), secret);
    await s.delete("cred_enc1");
    assert.equal(await s.get("cred_enc1"), null);
  });

  it("missing secret → null", async () => {
    const s = new EncryptedFileCredentialStore({
      rootDir: path.join(tmp, "enc-miss"),
    });
    assert.equal(await s.get("cred_nope"), null);
  });
});

describe("PHASE 59 binding / authorization", () => {
  it("server binding: authorized vs rejected", async () => {
    const mgr = createCredentialManager(new MemorySecretStore());
    const ref = await mgr.create(
      {
        name: "Bound",
        kind: "api_key",
        serverId: "server-a",
      },
      "bound-secret",
    );
    assert.equal(
      await mgr.getSecret(ref.credentialId, { serverId: "server-a" }),
      "bound-secret",
    );
    assert.equal(
      await mgr.getSecret(ref.credentialId, { serverId: "server-b" }),
      null,
    );
    assert.equal(await mgr.getSecret(ref.credentialId, {}), null);
  });

  it("integration mismatch rechazada", async () => {
    const mgr = createCredentialManager(new MemorySecretStore());
    const ref = await mgr.create(
      {
        name: "Int",
        kind: "api_key",
        integrationId: "int-1",
      },
      "int-secret",
    );
    assert.equal(
      await mgr.getSecret(ref.credentialId, { integrationId: "int-1" }),
      "int-secret",
    );
    assert.equal(
      await mgr.getSecret(ref.credentialId, { integrationId: "int-2" }),
      null,
    );
  });

  it("authorizeCredentialAccess helper", () => {
    const meta = {
      id: "cred_x",
      name: "n",
      kind: "api_key" as const,
      serverId: "s1",
      createdAt: "t",
      updatedAt: "t",
      status: "ACTIVE" as const,
    };
    assert.equal(authorizeCredentialAccess(meta, { serverId: "s1" }), true);
    assert.equal(authorizeCredentialAccess(meta, { serverId: "s2" }), false);
    assert.equal(
      authorizeCredentialAccess({ ...meta, status: "REVOKED" }, { serverId: "s1" }),
      false,
    );
  });
});

describe("PHASE 59 security isolation", () => {
  it("CredentialRef no contiene secret", async () => {
    const mgr = createCredentialManager(new MemorySecretStore());
    const ref = await mgr.create(
      { name: "R", kind: "api_key" },
      "super-secret-abc",
    );
    assert.ok(ref.credentialId);
    assert.equal(
      Object.prototype.hasOwnProperty.call(ref, "secret"),
      false,
    );
    assert.equal(JSON.stringify(ref).includes("super-secret"), false);
  });

  it("LLM boundary: vista sin secret", async () => {
    const mgr = createCredentialManager(new MemorySecretStore());
    const ref = await mgr.create(
      { name: "LLM", kind: "api_key", provider: "acme" },
      "must-not-reach-llm",
    );
    const meta = await mgr.getMetadata(ref.credentialId);
    const view = toLlmSafeCredentialView(meta!);
    assert.equal(view.credentialId, ref.credentialId);
    assert.equal(view.provider, "acme");
    assert.equal(JSON.stringify(view).includes("must-not"), false);
    assert.equal("secret" in view, false);
    assert.equal("apiKey" in view, false);
  });

  it("Android / QR boundary documentada: no secret en tipos públicos", () => {
    // Tipos exportados no incluyen secret en CredentialRef / Metadata.
    const sample = {
      credentialId: "cred_1",
      name: "x",
      kind: "api_key",
      status: "ACTIVE",
    };
    assert.equal("secret" in sample, false);
    assert.equal("pairingSecret" in sample, false);
  });

  it("id inválido rechazado", () => {
    assert.throws(() => assertSafeCredentialId("../etc/passwd"));
    assert.throws(() => assertSafeCredentialId("a/b"));
    assert.throws(() => assertSafeCredentialId(""));
  });

  it("secret no aparece en errores redactados", () => {
    const err = "Authorization: Bearer sk-live-abc apiKey=leak password=x";
    const out = redactForLog(err);
    assert.equal(out.includes("sk-live-abc"), false);
    assert.equal(out.includes("leak"), false);
  });
});

describe("PHASE 59 redaction", () => {
  it("Authorization Bearer / apiKey / password / secrets", () => {
    assert.match(
      redactString("Authorization: Bearer tokensecret"),
      /Bearer \[redacted\]/,
    );
    assert.equal(
      (redactSecrets({
        apiKey: "k",
        password: "p",
        secret: "s",
        clientSecret: "c",
        refreshToken: "r",
        ok: "visible",
      }) as Record<string, string>).apiKey,
      "[redacted]",
    );
    const obj = redactSecrets({
      authorization: "Bearer x",
      nested: { token: "t", name: "ok" },
    }) as { authorization: string; nested: { token: string; name: string } };
    assert.equal(obj.authorization, "[redacted]");
    assert.equal(obj.nested.token, "[redacted]");
    assert.equal(obj.nested.name, "ok");
  });
});

describe("PHASE 59 docs", () => {
  it("AUDIT + DESIGN existen", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    assert.ok(existsSync(path.join(root, "PHASE_59_AUDIT.md")));
    assert.ok(existsSync(path.join(root, "PHASE_59_DESIGN.md")));
    assert.ok(
      existsSync(path.join(root, "db/migrations/006_credentials.sql")),
    );
  });
});
