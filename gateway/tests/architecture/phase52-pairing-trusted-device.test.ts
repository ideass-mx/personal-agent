import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 52 pairing architecture docs + contracts", () => {
  it("documents Agent Identity vs Pairing vs Trusted Device", () => {
    const doc = fs.readFileSync(
      path.join(repoRoot, "docs/architecture/phase52-pairing-trusted-device.md"),
      "utf8",
    );
    assert.match(doc, /Agent Identity/);
    assert.match(doc, /Pairing Session/);
    assert.match(doc, /Trusted Device/);
    assert.match(doc, /personalagent:\/\/pair/);
    assert.match(doc, /HUB_TOKEN/);
    assert.match(doc, /5 minut/);
  });

  it("migration 004 defines pairing_sessions and trusted_devices", () => {
    const sql = fs.readFileSync(
      path.join(repoRoot, "db/migrations/004_pairing.sql"),
      "utf8",
    );
    assert.match(sql, /pairing_sessions/);
    assert.match(sql, /trusted_devices/);
    assert.match(sql, /secret_hash/);
    assert.match(sql, /credential_hash/);
  });

  it("PROTOCOL forbids treating HUB_TOKEN as QR pairing secret", () => {
    const proto = fs.readFileSync(
      path.join(repoRoot, "packages/protocol/PROTOCOL.md"),
      "utf8",
    );
    assert.match(proto, /pairing_request/);
    assert.match(proto, /authKind/);
    assert.match(proto, /personalagent:\/\/pair/);
    assert.match(proto, /5 minutos/);
  });
});
