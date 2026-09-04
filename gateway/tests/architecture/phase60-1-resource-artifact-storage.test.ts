/**
 * PHASE 60.1 — fronteras Resource / Artifact / ObjectStorage (decisión B).
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

function listTs(dirRel: string): string[] {
  const abs = path.join(repoRoot, dirRel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith(".ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

describe("PHASE 60.1 Resource / Artifact / ObjectStorage boundaries", () => {
  it("docs AUDIT + DESIGN existen y eligen opción B", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_60_1_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_60_1_DESIGN.md")));
    const design = read("PHASE_60_1_DESIGN.md");
    assert.match(design, /OPCIÓN B|OPCION B|Option B/i);
    assert.match(design, /Resource/);
    assert.match(design, /Artifact/);
    assert.match(design, /ObjectStorage/);
  });

  it("ObjectStorage no depende de MCP / AgentRuntime / Android / artifacts", () => {
    for (const file of listTs("gateway/src/storage")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["'][^"']*agents\/runtime/);
      assert.doesNotMatch(src, /from ["'][^"']*\/mcp-result/);
      assert.doesNotMatch(src, /from ["'][^"']*\/artifacts/);
      assert.doesNotMatch(src, /from ["'][^"']*tools\/mcp/);
      assert.doesNotMatch(src, /from ["'][^"']*resources/);
    }
    const types = read("gateway/src/storage/types.ts");
    assert.match(types, /interface ObjectStorage/);
    assert.match(types, /ObjectReference/);
  });

  it("Artifact no implementa storage físico ni SDKs cloud", () => {
    for (const file of listTs("gateway/src/artifacts")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["']@aws-sdk/);
      assert.doesNotMatch(src, /from ["'][^"']*storage\/local/);
      assert.doesNotMatch(src, /from ["'][^"']*storage\/s3/);
      assert.doesNotMatch(src, /from ["'][^"']*storage\/providers/);
      assert.doesNotMatch(src, /from ["']node:fs["']/);
      assert.doesNotMatch(src, /createReadStream|readFileSync|writeFileSync/);
    }
    const mgr = read("gateway/src/artifacts/manager.ts");
    assert.match(mgr, /ObjectStorage/);
    assert.match(mgr, /insertArtifactRow|getArtifactRow/);
    assert.doesNotMatch(
      mgr,
      /from ["'][^"']*storage\/local|from ["'][^"']*LocalObjectStorage/,
    );
    const types = read("gateway/src/artifacts/types.ts");
    assert.match(types, /provenance|ArtifactProvenance/);
    assert.match(types, /storage:\s*ObjectReference/);
  });

  it("Artifact aporta semántica distinta de ObjectStorage (metadata + provenance)", () => {
    const art = read("gateway/src/artifacts/types.ts");
    const storage = read("gateway/src/storage/types.ts");
    assert.match(art, /provenance/);
    assert.match(art, /createdAt/);
    assert.doesNotMatch(storage, /provenance|sourceType|conversation/i);
    assert.match(storage, /put\(|openReadStream|delete\(/);
  });

  it("Resource no implica persistencia; extract no crea Artifact", () => {
    const extract = read("gateway/src/resources/extract.ts");
    assert.match(extract, /NO persiste|NO crea Artifact|no.*Artifact/i);
    assert.doesNotMatch(extract, /ArtifactManager|insertArtifact|ObjectStorage/);
    const types = read("gateway/src/resources/types.ts");
    assert.match(types, /ResourceKind/);
    assert.doesNotMatch(types, /storage_provider|ObjectReference/);
  });

  it("MCP resource no crea Artifact automáticamente (código + test)", () => {
    const mgr = read("gateway/src/artifacts/manager.ts");
    assert.match(mgr, /no auto-download/i);
    const phase57 = read("gateway/tests/artifacts/phase57-artifact-storage.test.ts");
    assert.match(phase57, /no se convierte automáticamente en Artifact/);
  });

  it("HTTP delivery usa artifactId de dominio, no path de storage", () => {
    const http = read("gateway/src/http/artifact-http.ts");
    assert.match(http, /\/artifacts\/:artifactId/);
    assert.match(http, /artifacts\.get|resolveArtifact/);
    assert.doesNotMatch(http, /PERSONAL_AGENT_OBJECTS_DIR|path\.join.*artifactId/);
    assert.doesNotMatch(http, /@aws-sdk|LocalObjectStorage/);
  });

  it("no hay capas ArtifactService/Repository inventadas", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/artifacts/repository.ts")),
      false,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/artifacts/service.ts")),
      false,
    );
    const files = listTs("gateway/src/artifacts").map((f) => path.basename(f));
    assert.ok(files.includes("manager.ts"));
    assert.ok(files.includes("store.ts"));
    assert.ok(files.includes("types.ts"));
  });
});
