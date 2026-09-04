/**
 * PHASE 60 — fronteras ObjectStorage / ArtifactManager / Android / MCP.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function listFiles(dirRel: string, exts: string[]): string[] {
  const abs = path.join(repoRoot, dirRel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (exts.some((e) => name.name.endsWith(e))) out.push(p);
    }
  };
  walk(abs);
  return out;
}

describe("PHASE 60 architecture boundaries", () => {
  it("docs existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_60_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_60_DESIGN.md")));
  });

  it("ArtifactManager no importa AWS/MinIO/Wasabi SDK ni CredentialStore", () => {
    const mgr = read("gateway/src/artifacts/manager.ts");
    assert.doesNotMatch(mgr, /@aws-sdk|client-s3|minio|wasabi/i);
    assert.doesNotMatch(mgr, /from ["'][^"']*credentials/);
    assert.doesNotMatch(mgr, /SecretStore|CredentialStore/);
    assert.match(mgr, /ObjectStorage/);
  });

  it("artifacts/ no dependen de SDK cloud", () => {
    for (const file of listFiles("gateway/src/artifacts", [".ts"])) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /@aws-sdk\/client-s3/);
    }
  });

  it("Android no contiene S3 SDK ni SecretStore Gateway", () => {
    const androidRoot = path.join(
      repoRoot,
      "mobile/android/app/src/main/java",
    );
    if (!existsSync(androidRoot)) return;
    for (const file of listFiles("mobile/android/app/src/main/java", [".kt"])) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /@aws-sdk|AmazonS3|SecretStore|CredentialManager/);
    }
  });

  it("MCP protocol no menciona ObjectStorage", () => {
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /ObjectStorage|S3ObjectStorage/i);
  });

  it("storage-factory default local; createObjectStorage exportado", () => {
    const factory = read("gateway/src/storage/storage-factory.ts");
    assert.match(factory, /createObjectStorage/);
    assert.match(factory, /LocalObjectStorage|createLocalObjectStorage/);
    const config = read("gateway/src/storage/storage-config.ts");
    assert.match(config, /DEFAULT|local/);
    assert.match(config, /Unsupported object storage provider/);
  });

  it("index boot usa factory; local-first", () => {
    const index = read("gateway/src/index.ts");
    assert.match(index, /createObjectStorage/);
    assert.match(index, /resolveStorageConfigFromEnv/);
  });

  it("aws-s3-client es lazy (dynamic import)", () => {
    const aws = read("gateway/src/storage/aws-s3-client.ts");
    assert.match(aws, /await import\(["']@aws-sdk\/client-s3["']\)/);
  });
});
