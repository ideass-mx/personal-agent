/**
 * PHASE 58 — Artifact HTTP delivery (auth, headers, streaming, mock storage).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type {
  ObjectReference,
  ObjectStorage,
} from "../../src/storage/types.ts";
import {
  contentDispositionAttachment,
  mountArtifactHttp,
  parseBytesRange,
  sanitizeContentType,
  sanitizeDownloadFilename,
} from "../../src/http/artifact-http.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const gatewaySrc = path.resolve(here, "../../src");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-58-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "e".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_ID = "55555555-5555-4555-8555-555555555555";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { createLocalObjectStorage } = await import("../../src/storage/local.ts");
const { createArtifactManager } = await import("../../src/artifacts/manager.ts");
const store = await import("../../src/pairing/store.ts");

const HUB = process.env.HUB_TOKEN!;

function appWith(artifacts: ReturnType<typeof createArtifactManager>) {
  const app = new Hono();
  mountArtifactHttp(app, { artifacts, hubToken: HUB });
  return app;
}

describe("PHASE 58 header sanitizers", () => {
  it("MIME fallback octet-stream", () => {
    assert.equal(sanitizeContentType("application/pdf"), "application/pdf");
    assert.equal(sanitizeContentType("image/png"), "image/png");
    assert.equal(sanitizeContentType(undefined), "application/octet-stream");
    assert.equal(
      sanitizeContentType("text/html\r\nX-Injected: yes"),
      "application/octet-stream",
    );
  });

  it("filename sanitization blocks injection / traversal", () => {
    assert.equal(sanitizeDownloadFilename("normal.pdf"), "normal.pdf");
    const evil = sanitizeDownloadFilename("evil\r\nHeader: injected.pdf");
    assert.equal(evil.includes("\r"), false);
    assert.equal(evil.includes("\n"), false);
    const trav = sanitizeDownloadFilename("../../secret.pdf");
    assert.equal(trav.includes("/"), false);
    assert.equal(trav.includes("\\"), false);
    assert.match(contentDispositionAttachment(evil), /^attachment; filename="/);
    assert.equal(
      contentDispositionAttachment(evil).includes("\r"),
      false,
    );
  });

  it("parseBytesRange", () => {
    assert.deepEqual(parseBytesRange(undefined, 100), {
      ok: true,
      start: 0,
      end: 99,
    });
    assert.deepEqual(parseBytesRange("bytes=0-9", 100), {
      ok: true,
      start: 0,
      end: 9,
    });
    assert.equal(parseBytesRange("bytes=200-300", 100).ok, false);
  });
});

describe("PHASE 58 Artifact HTTP", () => {
  it("anonymous → 401", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o1"),
    });
    const artifacts = createArtifactManager(storage);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("x"),
      mimeType: "text/plain",
      name: "a.txt",
    });
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/${art.id}`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "unauthorized");
  });

  it("install Bearer → 200 stream body + headers", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o2"),
    });
    const artifacts = createArtifactManager(storage);
    const payload = Buffer.alloc(64 * 1024, 0x41); // 64 KiB
    const art = await artifacts.createFromBytes({
      bytes: new Uint8Array(payload),
      mimeType: "application/pdf",
      name: "report.pdf",
    });
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/${art.id}`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    assert.equal(res.headers.get("Content-Length"), String(payload.length));
    assert.match(
      res.headers.get("Content-Disposition") ?? "",
      /attachment; filename="report\.pdf"/,
    );
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.length, payload.length);
    assert.equal(buf[0], 0x41);
  });

  it("HEAD returns metadata without body", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o3"),
    });
    const artifacts = createArtifactManager(storage);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("hello"),
      mimeType: "image/png",
      name: "pic.png",
    });
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/${art.id}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "image/png");
    assert.equal(res.headers.get("Content-Length"), "5");
    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, 0);
  });

  it("unknown artifact → 404", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o4"),
    });
    const artifacts = createArtifactManager(storage);
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/missing-id-zzzz`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 404);
  });

  it("device credential ACTIVE → 200; revoked → 401", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o5"),
    });
    const artifacts = createArtifactManager(storage);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("dev"),
      mimeType: "text/plain",
      name: "d.txt",
    });
    const s = store.createPairingSession();
    store.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "android-art-1",
    });
    const approved = store.approvePairingSession(s.id);
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const cred = approved.deviceCredential;

    const app = appWith(artifacts);
    const ok = await app.request(`/artifacts/${art.id}`, {
      headers: {
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "android-art-1",
      },
    });
    assert.equal(ok.status, 200);

    store.revokeTrustedDevice("android-art-1");
    const denied = await app.request(`/artifacts/${art.id}`, {
      headers: {
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "android-art-1",
      },
    });
    assert.equal(denied.status, 401);
  });

  it("Range bytes parcial → 206", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o6"),
    });
    const artifacts = createArtifactManager(storage);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("0123456789"),
      mimeType: "text/plain",
      name: "n.txt",
    });
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/${art.id}`, {
      headers: {
        Authorization: `Bearer ${HUB}`,
        Range: "bytes=2-5",
      },
    });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("Content-Range"), "bytes 2-5/10");
    assert.equal(await res.text(), "2345");
  });

  it("HTTP handler usa ObjectStorage mock (sin Local filesystem)", async () => {
    const mem = new Map<string, Uint8Array>();
    const mock: ObjectStorage = {
      async put(input) {
        const key = input.key ?? "k";
        if (!(input.bytes instanceof Uint8Array)) {
          throw new Error("mock put: bytes required");
        }
        mem.set(key, input.bytes);
        return { provider: "mock", key };
      },
      async get(ref: ObjectReference) {
        const b = mem.get(ref.key);
        if (!b) throw new Error("missing");
        return { bytes: b };
      },
      async openReadStream(ref, options) {
        const b = mem.get(ref.key);
        if (!b) throw new Error("missing");
        const start = options?.start ?? 0;
        const end = options?.end ?? b.byteLength - 1;
        const slice = b.slice(start, end + 1);
        return {
          stream: Readable.from([Buffer.from(slice)]),
          size: slice.byteLength,
          totalSize: b.byteLength,
          start,
          end,
          mimeType: "text/plain",
        };
      },
      async delete(ref) {
        mem.delete(ref.key);
      },
      async exists(ref) {
        return mem.has(ref.key);
      },
      async metadata(ref) {
        const b = mem.get(ref.key);
        if (!b) throw new Error("missing");
        return { size: b.byteLength, mimeType: "text/plain" };
      },
    };
    const artifacts = createArtifactManager(mock);
    const art = await artifacts.createFromBytes({
      bytes: new TextEncoder().encode("mock-stream"),
      mimeType: "text/plain",
      name: "m.txt",
    });
    const app = appWith(artifacts);
    const res = await app.request(`/artifacts/${art.id}`, {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "mock-stream");
    assert.equal(art.storage.provider, "mock");
  });

  it("openReadStream no usa readFile completo (API presente)", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "o7"),
    });
    assert.equal(typeof storage.openReadStream, "function");
    const localSrc = fs.readFileSync(
      path.join(gatewaySrc, "storage/local.ts"),
      "utf8",
    );
    assert.match(localSrc, /createReadStream/);
    const httpSrc = fs.readFileSync(
      path.join(gatewaySrc, "http/artifact-http.ts"),
      "utf8",
    );
    assert.doesNotMatch(httpSrc, /readFileSync|readFile\(/);
    assert.doesNotMatch(httpSrc, /from ["'].*storage\/local/);
    assert.doesNotMatch(httpSrc, /createLocalObjectStorage/);
  });
});

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
