/**
 * PHASE 57 — LocalObjectStorage + ArtifactManager.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { ObjectReference, ObjectStorage } from "../../src/storage/types.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "d".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_ID = "44444444-4444-4444-8444-444444444444";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { createLocalObjectStorage } = await import("../../src/storage/local.ts");
const { createArtifactManager } = await import("../../src/artifacts/manager.ts");
const { normalizeMcpResult } = await import("../../src/mcp-result/normalize.ts");
const { extractResources } = await import("../../src/resources/extract.ts");

describe("PHASE 57 Artifact + LocalObjectStorage", () => {
  it("persist bytes → Artifact → read identical; provenance; storage ref", async () => {
    const storage = createLocalObjectStorage({
      rootDir: process.env.PERSONAL_AGENT_OBJECTS_DIR!,
    });
    const manager = createArtifactManager(storage);
    const bytes = new TextEncoder().encode("hello-artifact-57");
    const art = await manager.createFromBytes({
      bytes,
      mimeType: "text/plain",
      name: "note.txt",
      provenance: {
        sourceType: "generated",
        toolName: "test.write",
        serverId: "local-node",
      },
    });
    assert.ok(art.id);
    assert.equal(art.mimeType, "text/plain");
    assert.equal(art.size, bytes.byteLength);
    assert.equal(art.storage.provider, "local");
    assert.equal(art.storage.key, art.id);
    assert.equal(art.provenance?.sourceType, "generated");
    assert.equal(art.provenance?.toolName, "test.write");

    const loaded = manager.get(art.id);
    assert.ok(loaded);
    assert.equal(loaded!.createdAt.length > 0, true);

    const roundtrip = await manager.readBytes(art.id);
    assert.deepEqual(Buffer.from(roundtrip), Buffer.from(bytes));

    // No secrets in artifact metadata shape
    assert.equal("credential" in art, false);
    assert.equal(JSON.stringify(art).toLowerCase().includes("secret"), false);
  });

  it("resource_link no se convierte automáticamente en Artifact", async () => {
    const n = normalizeMcpResult({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/a.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    const resources = extractResources(n);
    assert.equal(resources[0]?.kind, "external");
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "objects-b"),
    });
    const manager = createArtifactManager(storage);
    await assert.rejects(
      () => manager.createFromResource({ resource: resources[0]! }),
      /bytes|auto-download/i,
    );
  });

  it("embedded resource puede persistirse explícitamente", async () => {
    const n = normalizeMcpResult({
      content: [
        {
          type: "resource",
          resource: {
            uri: "mem://doc.txt",
            mimeType: "text/plain",
            text: "persist-me",
          },
        },
      ],
    });
    const [resource] = extractResources(n);
    assert.ok(resource);
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "objects-c"),
    });
    const manager = createArtifactManager(storage);
    const art = await manager.createFromResource({
      resource: resource!,
      provenance: { sourceType: "mcp", toolName: "doc.read", uri: resource!.uri },
    });
    const bytes = await manager.readBytes(art.id);
    assert.equal(new TextDecoder().decode(bytes), "persist-me");
  });

  it("ArtifactManager depende de ObjectStorage (mock), no de Local concreto", async () => {
    const store = new Map<string, Uint8Array>();
    const mock: ObjectStorage = {
      async put(input) {
        const key = input.key ?? "mock-key";
        if (!(input.bytes instanceof Uint8Array)) {
          throw new Error("mock put: bytes required");
        }
        store.set(key, input.bytes);
        return { provider: "mock", key };
      },
      async get(ref: ObjectReference) {
        const bytes = store.get(ref.key);
        if (!bytes) throw new Error("missing");
        return { bytes };
      },
      async openReadStream(ref) {
        const { Readable } = await import("node:stream");
        const bytes = store.get(ref.key);
        if (!bytes) throw new Error("missing");
        const stream = Readable.from([Buffer.from(bytes)]);
        return {
          stream,
          size: bytes.byteLength,
          totalSize: bytes.byteLength,
          start: 0,
          end: Math.max(0, bytes.byteLength - 1),
        };
      },
      async delete(ref) {
        store.delete(ref.key);
      },
      async exists(ref) {
        return store.has(ref.key);
      },
      async metadata(ref) {
        const bytes = store.get(ref.key);
        if (!bytes) throw new Error("missing");
        return { size: bytes.byteLength };
      },
    };
    const manager = createArtifactManager(mock);
    const art = await manager.createFromBytes({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "application/octet-stream",
    });
    assert.equal(art.storage.provider, "mock");
    assert.deepEqual(await manager.readBytes(art.id), new Uint8Array([1, 2, 3]));
  });

  it("local-first: sin AWS env / sin red requerida", async () => {
    assert.equal(process.env.AWS_ACCESS_KEY_ID, undefined);
    assert.equal(process.env.AWS_SECRET_ACCESS_KEY, undefined);
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "objects-offline"),
    });
    const ref = await storage.put({
      bytes: new Uint8Array([9]),
      mimeType: "application/octet-stream",
    });
    assert.equal(ref.provider, "local");
    assert.equal(await storage.exists(ref), true);
  });

  it("rechaza path traversal en key", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "objects-safe"),
    });
    await assert.rejects(
      () =>
        storage.put({
          key: "../etc/passwd",
          bytes: new Uint8Array([1]),
        }),
      /inválida|traversal/i,
    );
  });
});

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
