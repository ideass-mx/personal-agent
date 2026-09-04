/**
 * PHASE 62 — Artifact lifecycle, ArtifactReference, HTTP DELETE, boundaries.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-62-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "i".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "99999999-9999-4999-8999-999999999999";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { createLocalObjectStorage } = await import("../../src/storage/local.ts");
const {
  createArtifactManager,
  toArtifactReference,
  artifactsFromToolResult,
} = await import("../../src/artifacts/index.ts");
const { createResourceResolver, extractResources } = await import(
  "../../src/resources/index.ts"
);
const { normalizeMcpResult } = await import("../../src/mcp-result/normalize.ts");
const { mountArtifactHttp } = await import("../../src/http/artifact-http.ts");
const { isToolResult } = await import("../../src/tools/remote.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function mgr() {
  const storage = createLocalObjectStorage({
    rootDir: path.join(tmp, `o-${Math.random().toString(36).slice(2)}`),
  });
  return { storage, artifacts: createArtifactManager(storage) };
}

describe("PHASE 62 Artifact lifecycle", () => {
  it("create / get / reference / available", async () => {
    const { artifacts } = mgr();
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("life"),
      mimeType: "text/plain",
      name: "life.txt",
    });
    assert.equal(art.status, "AVAILABLE");
    assert.equal(artifacts.isAvailable(art.id), true);
    const ref = artifacts.getReference(art.id);
    assert.ok(ref);
    assert.equal(ref!.artifactId, art.id);
    assert.equal(ref!.url, `/artifacts/${art.id}`);
    assert.equal(ref!.mimeType, "text/plain");
    assert.equal(JSON.stringify(ref).includes("storage"), false);
    assert.equal(JSON.stringify(ref).includes("provider"), false);
    assert.equal(JSON.stringify(ref).includes('"key"'), false);
    assert.equal(JSON.stringify(ref).includes("bucket"), false);
  });

  it("expire → unavailable; getReference null", async () => {
    const { artifacts } = mgr();
    const art = await artifacts.createFromBytes({
      bytes: new Uint8Array([1]),
      mimeType: "application/octet-stream",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const loaded = artifacts.get(art.id);
    assert.equal(loaded!.status, "EXPIRED");
    assert.equal(artifacts.isAvailable(art.id), false);
    assert.equal(artifacts.getReference(art.id), null);
  });

  it("delete → DELETED; unavailable", async () => {
    const { artifacts, storage } = mgr();
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("bye"),
      mimeType: "text/plain",
    });
    const storageKey = art.storage.key;
    await artifacts.delete(art.id);
    const after = artifacts.get(art.id);
    assert.equal(after!.status, "DELETED");
    assert.equal(artifacts.isAvailable(art.id), false);
    assert.equal(await storage.exists({ provider: "local", key: storageKey }), false);
  });
});

describe("PHASE 62 HTTP delivery lifecycle", () => {
  function appWith(artifacts: ReturnType<typeof createArtifactManager>) {
    const app = new Hono();
    mountArtifactHttp(app, { artifacts, hubToken: HUB });
    return app;
  }

  it("GET ok; expired 410; deleted 404; DELETE 204", async () => {
    const { artifacts } = mgr();
    const app = appWith(artifacts);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("http-ok"),
      mimeType: "text/plain",
      name: "a.txt",
    });
    const ok = await app.request(`/artifacts/${art.id}`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(ok.status, 200);
    const body = await ok.text();
    assert.equal(body, "http-ok");
    assert.equal(body.includes("local"), false);

    const expired = await artifacts.createFromBytes({
      bytes: new Uint8Array([9]),
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() - 5000).toISOString(),
    });
    const gone = await app.request(`/artifacts/${expired.id}`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(gone.status, 410);
    const goneJson = await gone.json();
    assert.equal(goneJson.error.code, "artifact_expired");
    assert.equal(JSON.stringify(goneJson).includes("storage"), false);

    const del = await app.request(`/artifacts/${art.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(del.status, 204);
    const missing = await app.request(`/artifacts/${art.id}`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(missing.status, 404);
  });

  it("anonymous 401", async () => {
    const { artifacts } = mgr();
    const app = appWith(artifacts);
    const art = await artifacts.createFromBytes({
      bytes: new Uint8Array([1]),
      mimeType: "text/plain",
    });
    const res = await app.request(`/artifacts/${art.id}`);
    assert.equal(res.status, 401);
  });
});

describe("PHASE 62 Resource integration", () => {
  it("persist=false resource_link no Artifact", async () => {
    const { artifacts } = mgr();
    const resolver = createResourceResolver({ artifacts });
    const n = normalizeMcpResult({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/x.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    const [resource] = extractResources(n);
    const r = await resolver.resolve(resource!);
    assert.equal(r.status, "deferred");
    assert.equal(r.artifact, undefined);
    assert.equal(r.artifactReference, undefined);
  });

  it("persist=true embedded → ArtifactReference", async () => {
    const { artifacts } = mgr();
    const resolver = createResourceResolver({ artifacts });
    const r = await resolver.resolve(
      {
        id: "res_62",
        kind: "embedded",
        name: "n.txt",
        mimeType: "text/plain",
        inlineText: "ref-me",
      },
      { persist: true },
    );
    assert.equal(r.status, "resolved");
    assert.ok(r.artifactReference);
    assert.equal(r.artifactReference!.url.startsWith("/artifacts/"), true);
    assert.equal(
      JSON.stringify(r.artifactReference).includes("provider"),
      false,
    );
  });
});

describe("PHASE 62 Agent ToolResult artifacts", () => {
  it("text result compatible; artifacts optional", () => {
    const plain = { ok: true as const, content: "hola" };
    assert.equal(isToolResult(plain), true);
    const withArts = {
      ok: true as const,
      content: { note: "ok" },
      artifacts: [
        toArtifactReference({
          id: "art1",
          size: 1,
          mimeType: "text/plain",
          status: "AVAILABLE",
          storage: { provider: "local", key: "art1" },
          createdAt: "t",
        }),
      ],
    };
    assert.equal(isToolResult(withArts), true);
    const refs = artifactsFromToolResult(withArts);
    assert.equal(refs.length, 1);
    assert.equal(refs[0]!.url, "/artifacts/art1");
    assert.equal(JSON.stringify(refs[0]).includes("storage"), false);
  });
});

describe("PHASE 62 docs", () => {
  it("AUDIT + DESIGN + migration", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    assert.ok(fs.existsSync(path.join(root, "PHASE_62_AUDIT.md")));
    assert.ok(fs.existsSync(path.join(root, "PHASE_62_DESIGN.md")));
    assert.ok(
      fs.existsSync(path.join(root, "db/migrations/007_artifact_lifecycle.sql")),
    );
  });
});
