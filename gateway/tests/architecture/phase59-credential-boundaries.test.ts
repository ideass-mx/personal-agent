/**
 * PHASE 59 — fronteras arquitectónicas de Credential Management.
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
      else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  };
  walk(abs);
  return out;
}

describe("PHASE 59 architecture boundaries", () => {
  it("docs + migration", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_59_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_59_DESIGN.md")));
    const sql = read("db/migrations/006_credentials.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS credentials/);
    assert.doesNotMatch(sql, /\bsecret\b/i);
  });

  it("AgentDefinition no importa CredentialStore / SecretStore", () => {
    const def = read("gateway/src/agents/definition.ts");
    assert.doesNotMatch(def, /credentials|SecretStore|CredentialManager/);
  });

  it("AgentRuntime no importa credentials", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /from ["'].*credentials/);
    assert.doesNotMatch(runtime, /getSecret|SecretStore/);
  });

  it("Memory no importa CredentialStore", () => {
    for (const file of listTs("gateway/src/memory")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /from ["'].*credentials|SecretStore|CredentialManager/,
        file,
      );
    }
  });

  it("ArtifactStore no importa CredentialStore", () => {
    for (const file of listTs("gateway/src/artifacts")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /from ["'].*credentials|SecretStore|CredentialManager/,
        file,
      );
    }
  });

  it("Android no contiene SecretStore / CredentialManager de Gateway", () => {
    const androidRoot = path.join(
      repoRoot,
      "mobile/android/app/src/main/java",
    );
    if (!existsSync(androidRoot)) return;
    const walk = (d: string) => {
      for (const name of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, name.name);
        if (name.isDirectory()) walk(p);
        else if (name.name.endsWith(".kt")) {
          const src = readFileSync(p, "utf8");
          assert.doesNotMatch(src, /SecretStore|CredentialManager|EncryptedFileCredentialStore/);
        }
      }
    };
    walk(androidRoot);
  });

  it("MCP protocol no introduce credential://", () => {
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /credential:\/\//i);
    const messages = read("packages/protocol/messages.ts");
    assert.doesNotMatch(messages, /credential:\/\//i);
  });

  it("credentials module no importa AgentRuntime / artifacts / TurnMemory", () => {
    for (const file of listTs("gateway/src/credentials")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["'][^"']*agents\/runtime/);
      assert.doesNotMatch(src, /from ["'][^"']*\/artifacts\//);
      assert.doesNotMatch(src, /from ["'][^"']*\/memory\//);
      assert.doesNotMatch(src, /from ["'][^"']*\/pairing\//);
    }
  });

  it("WindowsCredentialStore + EncryptedFile existen", () => {
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "gateway/src/credentials/stores/windows-credential-store.ts",
        ),
      ),
    );
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "gateway/src/credentials/stores/encrypted-file-credential-store.ts",
        ),
      ),
    );
    const win = read(
      "gateway/src/credentials/stores/windows-credential-store.ts",
    );
    assert.match(win, /CredWrite|advapi32/);
  });
});
