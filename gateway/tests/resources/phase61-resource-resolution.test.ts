/**
 * PHASE 61 — ResourceResolver: consume / defer / persist / SSRF.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-61-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "h".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "88888888-8888-4888-8888-888888888888";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const { createLocalObjectStorage } = await import("../../src/storage/local.ts");
const { createArtifactManager } = await import("../../src/artifacts/manager.ts");
const {
  createResourceResolver,
  extractResources,
  sanitizeResourceUri,
  isBlockedIpAddress,
  isBlockedHostname,
  assertUrlSafeForFetch,
} = await import("../../src/resources/index.ts");
const { normalizeMcpResult } = await import("../../src/mcp-result/normalize.ts");

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function storageAndArtifacts() {
  const storage = createLocalObjectStorage({
    rootDir: path.join(tmp, `obj-${Math.random().toString(36).slice(2)}`),
  });
  return { storage, artifacts: createArtifactManager(storage) };
}

describe("PHASE 61 Resource behavior", () => {
  it("embedded resolves without Artifact when persist=false", async () => {
    const resolver = createResourceResolver();
    const r = await resolver.resolve({
      id: "res_emb1",
      kind: "embedded",
      mimeType: "text/plain",
      inlineText: "hello",
    });
    assert.equal(r.status, "resolved");
    assert.equal(r.artifact, undefined);
    assert.equal(new TextDecoder().decode(r.bytes!), "hello");
  });

  it("resource_link remains deferred when persist=false", async () => {
    const n = normalizeMcpResult({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/a.pdf",
          mimeType: "application/pdf",
          name: "a",
        },
      ],
    });
    const [resource] = extractResources(n);
    const resolver = createResourceResolver();
    const r = await resolver.resolve(resource!);
    assert.equal(r.status, "deferred");
    assert.equal(r.artifact, undefined);
    assert.equal(r.externalReference?.uri.includes("example.com"), true);
  });

  it("unsupported scheme rejected", async () => {
    const resolver = createResourceResolver();
    const r = await resolver.resolve({
      id: "res_x",
      kind: "external",
      uri: "ftp://files.example/x",
    }, { persist: true, allowExternal: true });
    assert.equal(r.status, "unsupported");
  });

  it("blocked MIME rejected", async () => {
    const resolver = createResourceResolver();
    const r = await resolver.resolve(
      {
        id: "res_m",
        kind: "embedded",
        mimeType: "application/x-msdownload",
        inlineBytes: new Uint8Array([1, 2, 3]),
      },
      { blockedMimeTypes: ["application/x-msdownload"] },
    );
    assert.equal(r.status, "blocked");
  });
});

describe("PHASE 61 Persistence", () => {
  it("persist=false does not create Artifact", async () => {
    const { artifacts } = storageAndArtifacts();
    const resolver = createResourceResolver({ artifacts });
    const r = await resolver.resolve(
      {
        id: "res_p0",
        kind: "embedded",
        inlineText: "x",
        mimeType: "text/plain",
      },
      { persist: false },
    );
    assert.equal(r.status, "resolved");
    assert.equal(r.artifact, undefined);
  });

  it("persist=true creates Artifact via ObjectStorage", async () => {
    const { artifacts, storage } = storageAndArtifacts();
    const resolver = createResourceResolver({ artifacts });
    const r = await resolver.resolve(
      {
        id: "res_p1",
        kind: "embedded",
        name: "note.txt",
        mimeType: "text/plain",
        inlineText: "persist-me",
      },
      { persist: true },
    );
    assert.equal(r.status, "resolved");
    assert.ok(r.artifact);
    assert.equal(r.artifact!.name, "note.txt");
    assert.equal("bytes" in r.artifact!, false);
    const obj = await storage.get(r.artifact!.storage);
    assert.equal(new TextDecoder().decode(obj.bytes), "persist-me");
  });
});

describe("PHASE 61 Security SSRF", () => {
  it("blocks localhost / loopback / private / metadata IPs", () => {
    assert.equal(isBlockedHostname("localhost"), true);
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.1"), true);
    assert.equal(isBlockedIpAddress("192.168.1.1"), true);
    assert.equal(isBlockedIpAddress("172.16.5.5"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  });

  it("assertUrlSafeForFetch blocks literal private IP URLs", async () => {
    const r = await assertUrlSafeForFetch("http://127.0.0.1/secret");
    assert.equal(r.ok, false);
    const meta = await assertUrlSafeForFetch(
      "http://169.254.169.254/latest/meta-data/",
    );
    assert.equal(meta.ok, false);
  });

  it("default policy blocks external even with fake public URL", async () => {
    const resolver = createResourceResolver();
    const r = await resolver.resolve(
      {
        id: "res_ext",
        kind: "external",
        uri: "https://example.com/file.pdf",
      },
      { persist: true },
    );
    assert.equal(r.status, "blocked");
    assert.match(r.reason ?? "", /allowExternal/);
  });

  it("redirect to private address blocked", async () => {
    const { artifacts } = storageAndArtifacts();
    let hop = 0;
    const fetchImpl: typeof fetch = async () => {
      hop += 1;
      if (hop === 1) {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/x" },
        });
      }
      return new Response("should-not", { status: 200 });
    };
    const resolver = createResourceResolver({ artifacts, fetchImpl });
    const r = await resolver.resolve(
      {
        id: "res_redir",
        kind: "external",
        uri: "https://example.com/start",
      },
      {
        persist: true,
        allowExternal: true,
        allowHttps: true,
        allowHttp: true,
        maxRedirects: 3,
      },
    );
    assert.equal(r.status, "blocked");
    assert.match(r.reason ?? "", /bloquead|127|IP|hostname/i);
  });

  it("too many redirects blocked", async () => {
    const { artifacts } = storageAndArtifacts();
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://example.com/h${n}` },
      });
    };
    // Bypass SSRF by mocking assert via fetch only after safe check —
    // use IP that is public in URL host that DNS might resolve; instead inject
    // fetch that never returns 200 and patch by using hosts that fail SSRF on redirect to self.
    // Simpler: stub fetchImpl + use allowExternal with hostname that passes DNS.
    // For unit test of redirect count, call fetchWithSsrfGuards with mocked fetch
    // after making assertUrlSafeForFetch pass — we use 8.8.8.8 as host? That's IP public.
    const { fetchWithSsrfGuards } = await import(
      "../../src/resources/resolve.ts"
    );
    const { mergeResourceResolutionPolicy } = await import(
      "../../src/resources/policy.ts"
    );
    let hops = 0;
    const fetchLoop: typeof fetch = async () => {
      hops += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: "http://8.8.8.8/next" },
      });
    };
    const out = await fetchWithSsrfGuards(
      "http://8.8.8.8/start",
      mergeResourceResolutionPolicy({
        allowExternal: true,
        allowHttp: true,
        maxRedirects: 2,
        persist: true,
      }),
      fetchLoop,
    );
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.status, "blocked");
      assert.match(out.reason, /redirect/i);
    }
    void artifacts;
  });

  it("oversized Content-Length blocked", async () => {
    const { artifacts } = storageAndArtifacts();
    const fetchImpl: typeof fetch = async () =>
      new Response("x", {
        status: 200,
        headers: {
          "Content-Length": String(100_000_000),
          "Content-Type": "application/octet-stream",
        },
      });
    const resolver = createResourceResolver({ artifacts, fetchImpl });
    const r = await resolver.resolve(
      {
        id: "res_big",
        kind: "external",
        uri: "http://8.8.8.8/big",
      },
      {
        persist: true,
        allowExternal: true,
        allowHttp: true,
        maxBytes: 1024,
      },
    );
    assert.equal(r.status, "blocked");
    assert.match(r.reason ?? "", /Content-Length|maxBytes/i);
  });
});

describe("PHASE 61 Streaming + size while streaming", () => {
  it("stream put to LocalObjectStorage without caller Buffer", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "stream-put"),
      maxBytes: 1024,
    });
    const stream = Readable.from([Buffer.from("abc"), Buffer.from("def")]);
    const ref = await storage.put({
      key: "streamkey01",
      stream,
      mimeType: "text/plain",
    });
    const got = await storage.get(ref);
    assert.equal(new TextDecoder().decode(got.bytes), "abcdef");
  });

  it("size limit enforced while streaming", async () => {
    const storage = createLocalObjectStorage({
      rootDir: path.join(tmp, "stream-limit"),
      maxBytes: 8,
    });
    const stream = Readable.from([Buffer.alloc(20, 1)]);
    await assert.rejects(
      () => storage.put({ key: "toolarge01", stream }),
      /máximo|max/i,
    );
  });
});

describe("PHASE 61 Provenance", () => {
  it("credentials and query secrets sanitized", async () => {
    const cleaned = sanitizeResourceUri(
      "https://user:pass@example.com/file?token=sekrit&x=1",
    );
    assert.ok(cleaned);
    assert.equal(cleaned!.includes("pass"), false);
    assert.equal(cleaned!.includes("sekrit"), false);
    assert.equal(cleaned!.includes("user"), false);
    assert.match(cleaned!, /example\.com\/file/);

    const { artifacts } = storageAndArtifacts();
    const resolver = createResourceResolver({ artifacts });
    const r = await resolver.resolve(
      {
        id: "res_prov",
        kind: "embedded",
        uri: "https://user:pass@example.com/a?access_token=abc",
        inlineText: "z",
        mimeType: "text/plain",
      },
      { persist: true },
    );
    assert.equal(r.status, "resolved");
    assert.equal(r.artifact!.provenance?.uri?.includes("pass"), false);
    assert.equal(r.artifact!.provenance?.uri?.includes("access_token"), false);
  });
});

describe("PHASE 61 HTTP persist happy path (mock fetch)", () => {
  it("persist=true downloads via mock and creates Artifact", async () => {
    const { artifacts, storage } = storageAndArtifacts();
    const body = "remote-bytes";
    const fetchImpl: typeof fetch = async () =>
      new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": String(body.length),
        },
      });
    const resolver = createResourceResolver({ artifacts, fetchImpl });
    const r = await resolver.resolve(
      {
        id: "res_http",
        kind: "external",
        uri: "http://8.8.8.8/doc.txt",
        name: "doc.txt",
      },
      {
        persist: true,
        allowExternal: true,
        allowHttp: true,
        maxBytes: 10_000,
      },
    );
    assert.equal(r.status, "resolved");
    assert.ok(r.artifact);
    const obj = await storage.get(r.artifact!.storage);
    assert.equal(new TextDecoder().decode(obj.bytes), body);
  });
});

describe("PHASE 61 docs", () => {
  it("AUDIT + DESIGN existen", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    assert.ok(fs.existsSync(path.join(root, "PHASE_61_AUDIT.md")));
    assert.ok(fs.existsSync(path.join(root, "PHASE_61_DESIGN.md")));
  });
});
