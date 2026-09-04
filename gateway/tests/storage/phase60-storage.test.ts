/**
 * PHASE 60 — factory, providers, credentials, security.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-60-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "g".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "77777777-7777-4777-8777-777777777777";
delete process.env.PERSONAL_AGENT_STORAGE_PROVIDER;
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  createObjectStorage,
  parseStorageProviderId,
  resolveStorageConfigFromEnv,
  createLocalObjectStorage,
  createS3ObjectStorage,
  createMinioObjectStorage,
  createWasabiObjectStorage,
  LocalObjectStorage,
  S3CompatibleObjectStorage,
  parseS3AccessSecret,
} = await import("../../src/storage/index.ts");
const {
  createCredentialManager,
  MemorySecretStore,
  redactForLog,
} = await import("../../src/credentials/index.ts");
const { createArtifactManager } = await import("../../src/artifacts/manager.ts");
const { FakeS3Client } = await import("./fake-s3-client.ts");
const { describeStorageContract } = await import("./contract.ts");

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("PHASE 60 StorageFactory", () => {
  it("local resolves LocalObjectStorage (default)", () => {
    const storage = createObjectStorage({
      config: { provider: "local", rootDir: path.join(tmp, "local-a") },
    });
    assert.ok(storage instanceof LocalObjectStorage);
    assert.equal(parseStorageProviderId(undefined), "local");
    assert.equal(parseStorageProviderId("local"), "local");
  });

  it("s3 / minio / wasabi resolve S3Compatible wrappers", () => {
    const fake = new FakeS3Client();
    const creds = createCredentialManager(new MemorySecretStore());
    const s3 = createObjectStorage({
      config: {
        provider: "s3",
        bucket: "b",
        region: "us-east-1",
        credentialRef: "cred_x",
      },
      credentials: creds,
      client: fake,
    });
    const minio = createObjectStorage({
      config: {
        provider: "minio",
        bucket: "b",
        region: "us-east-1",
        endpoint: "http://127.0.0.1:9000",
        credentialRef: "cred_x",
      },
      credentials: creds,
      client: fake,
    });
    const wasabi = createObjectStorage({
      config: {
        provider: "wasabi",
        bucket: "b",
        region: "us-east-1",
        endpoint: "https://s3.wasabisys.com",
        credentialRef: "cred_x",
      },
      credentials: creds,
      client: fake,
    });
    assert.ok(s3 instanceof S3CompatibleObjectStorage);
    assert.ok(minio instanceof S3CompatibleObjectStorage);
    assert.ok(wasabi instanceof S3CompatibleObjectStorage);
    assert.equal(
      (s3 as InstanceType<typeof S3CompatibleObjectStorage>).providerId,
      "s3",
    );
    assert.equal(
      (minio as InstanceType<typeof S3CompatibleObjectStorage>).providerId,
      "minio",
    );
    assert.equal(
      (wasabi as InstanceType<typeof S3CompatibleObjectStorage>).providerId,
      "wasabi",
    );
  });

  it("unknown provider rejected", () => {
    assert.throws(
      () => parseStorageProviderId("xyz"),
      /Unsupported object storage provider: xyz/,
    );
  });

  it("env default local; AWS_* no activa s3", () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIA_SHOULD_NOT_SWITCH";
    process.env.AWS_SECRET_ACCESS_KEY = "secret_should_not_switch";
    delete process.env.PERSONAL_AGENT_STORAGE_PROVIDER;
    const cfg = resolveStorageConfigFromEnv({
      objectsRoot: path.join(tmp, "objects"),
    });
    assert.equal(cfg.provider, "local");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });
});

describe("PHASE 60 CredentialManager integration", () => {
  it("cloud usa CredentialManager; secret no en config serializada", async () => {
    const secrets = new MemorySecretStore();
    const mgr = createCredentialManager(secrets);
    const ref = await mgr.create(
      {
        id: "credstorage1",
        name: "S3 primary",
        kind: "api_key",
        provider: "s3",
        integrationId: "object-storage",
      },
      JSON.stringify({
        accessKeyId: "AKIA_TEST_KEY",
        secretAccessKey: "super_secret_storage_key",
      }),
    );
    const fake = new FakeS3Client();
    // Cliente inyectado: no llama getSecret; comprobamos formato + isolation.
    const storage = createS3ObjectStorage({
      bucket: "artifacts",
      region: "us-east-1",
      credentialRef: ref.credentialId,
      credentials: mgr,
      client: fake,
    });
    const put = await storage.put({
      bytes: new TextEncoder().encode("cloud-bytes"),
      mimeType: "text/plain",
      key: "artcloud01",
    });
    assert.equal(put.provider, "s3");
    const meta = await mgr.getMetadata(ref.credentialId);
    assert.equal(JSON.stringify(meta).includes("super_secret"), false);
    assert.equal(JSON.stringify(meta).includes("AKIA_TEST"), false);

    // Resolución real vía CredentialManager (sin client inyectado) usando createClient mock.
    let resolved = false;
    const storage2 = new S3CompatibleObjectStorage({
      providerId: "s3",
      bucket: "artifacts",
      region: "us-east-1",
      credentialRef: ref.credentialId,
      credentials: mgr,
      createClient: async (creds) => {
        resolved = true;
        assert.equal(creds.accessKeyId, "AKIA_TEST_KEY");
        assert.equal(creds.secretAccessKey, "super_secret_storage_key");
        return fake;
      },
    });
    await storage2.put({
      bytes: new TextEncoder().encode("via-cred"),
      key: "artcloud02",
    });
    assert.equal(resolved, true);
  });

  it("parseS3AccessSecret", () => {
    const p = parseS3AccessSecret(
      JSON.stringify({
        accessKeyId: "A",
        secretAccessKey: "B",
        sessionToken: "C",
      }),
    );
    assert.equal(p.accessKeyId, "A");
    assert.equal(p.sessionToken, "C");
  });
});

describe("PHASE 60 ArtifactManager isolation", () => {
  it("cambiar provider sin modificar ArtifactManager", async () => {
    const local = createLocalObjectStorage({
      rootDir: path.join(tmp, "am-local"),
    });
    const mgrLocal = createArtifactManager(local);
    const a1 = await mgrLocal.createFromBytes({
      bytes: new TextEncoder().encode("local"),
      mimeType: "text/plain",
      name: "a.txt",
    });
    assert.equal(a1.storage.provider, "local");

    const fake = new FakeS3Client();
    const s3 = createS3ObjectStorage({
      bucket: "b",
      region: "r",
      credentialRef: "cred_unused",
      credentials: createCredentialManager(new MemorySecretStore()),
      client: fake,
    });
    const mgrS3 = createArtifactManager(s3);
    const a2 = await mgrS3.createFromBytes({
      bytes: new TextEncoder().encode("s3"),
      mimeType: "text/plain",
      name: "b.txt",
      id: "arts3000001",
    });
    assert.equal(a2.storage.provider, "s3");
  });
});

describe("PHASE 60 security redaction", () => {
  it("secret / authorization no en redactForLog", () => {
    const out = redactForLog(
      "Authorization: AWS4-HMAC-SHA256 Credential=AKIAEXAMPLEKEY12345/secret accessKey=leak",
    );
    assert.equal(out.includes("AKIAEXAMPLEKEY12345"), false);
    assert.equal(out.includes("leak"), false);
    assert.match(out, /\[redacted\]/i);
  });
});

describeStorageContract(
  "LocalObjectStorage",
  () =>
    createLocalObjectStorage({ rootDir: path.join(tmp, "contract-local") }),
  "local",
);

describeStorageContract(
  "S3ObjectStorage",
  () =>
    createS3ObjectStorage({
      bucket: "contract",
      region: "us-east-1",
      credentialRef: "cred_fake",
      credentials: createCredentialManager(new MemorySecretStore()),
      client: new FakeS3Client(),
    }),
  "s3",
);

describeStorageContract(
  "MinioObjectStorage",
  () =>
    createMinioObjectStorage({
      bucket: "contract",
      region: "us-east-1",
      endpoint: "http://127.0.0.1:9000",
      credentialRef: "cred_fake",
      credentials: createCredentialManager(new MemorySecretStore()),
      client: new FakeS3Client(),
    }),
  "minio",
);

describeStorageContract(
  "WasabiObjectStorage",
  () =>
    createWasabiObjectStorage({
      bucket: "contract",
      region: "us-east-1",
      endpoint: "https://s3.wasabisys.com",
      credentialRef: "cred_fake",
      credentials: createCredentialManager(new MemorySecretStore()),
      client: new FakeS3Client(),
    }),
  "wasabi",
);

describe("PHASE 60 offline local", () => {
  it("local put/get sin internet / sin SDK cloud en ruta local", async () => {
    const storage = createObjectStorage({
      config: { provider: "local", rootDir: path.join(tmp, "offline") },
    });
    const ref = await storage.put({
      bytes: new TextEncoder().encode("offline-ok"),
      key: "offlinekey01",
    });
    const got = await storage.get(ref);
    assert.equal(new TextDecoder().decode(got.bytes), "offline-ok");
  });
});

describe("PHASE 60 docs", () => {
  it("AUDIT + DESIGN existen", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    assert.ok(fs.existsSync(path.join(root, "PHASE_60_AUDIT.md")));
    assert.ok(fs.existsSync(path.join(root, "PHASE_60_DESIGN.md")));
  });
});
