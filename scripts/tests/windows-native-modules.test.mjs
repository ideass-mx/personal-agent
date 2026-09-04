/**
 * PHASE 64.1 — native module format detection + Windows package validation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  detectBinaryFormat,
  findNativeModules,
  validateWindowsNativeModules,
} from "../windows-native-modules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");

describe("PHASE 64.1 binary format detection", () => {
  it("Test 1: PE x64 → PASS format", () => {
    const buf = readFileSync(path.join(fixtures, "sample-pe.node"));
    const d = detectBinaryFormat(buf);
    assert.equal(d.format, "PE");
    assert.equal(d.architecture, "x64");
  });

  it("Test 2: ELF → FAIL for Windows", () => {
    const buf = readFileSync(path.join(fixtures, "sample-elf.node"));
    const d = detectBinaryFormat(buf);
    assert.equal(d.format, "ELF");
  });

  it("Test 3: Mach-O → FAIL for Windows", () => {
    const buf = readFileSync(path.join(fixtures, "sample-macho.node"));
    const d = detectBinaryFormat(buf);
    assert.equal(d.format, "Mach-O");
  });

  it("Test 4: unknown / truncated → FAIL", () => {
    const unk = detectBinaryFormat(
      readFileSync(path.join(fixtures, "sample-unknown.node")),
    );
    assert.equal(unk.format, "unknown");
    const trunc = detectBinaryFormat(
      readFileSync(path.join(fixtures, "sample-truncated.node")),
    );
    assert.equal(trunc.format, "unknown");
  });
});

describe("PHASE 64.1 package tree validation", () => {
  it("valid PE fixture tree → PASS", () => {
    const root = path.join(fixtures, "windows-package-valid");
    const logs = [];
    const result = validateWindowsNativeModules(root, {
      log: (s) => logs.push(s),
    });
    assert.equal(result.ok, true);
    assert.equal(result.modules.length, 1);
    assert.equal(result.modules[0].format, "PE");
    assert.equal(result.modules[0].result, "PASS");
    assert.match(logs.join("\n"), /validation=PASS/);
  });

  it("invalid ELF fixture tree → FAIL + exit semantics", () => {
    const root = path.join(fixtures, "windows-package-invalid");
    const result = validateWindowsNativeModules(root, { log: () => {} });
    assert.equal(result.ok, false);
    assert.equal(result.modules.length, 1);
    assert.equal(result.modules[0].format, "ELF");
    assert.equal(result.modules[0].result, "FAIL");
    assert.ok(result.errors.some((e) => /ELF/.test(e)));
  });

  it("findNativeModules reports all .node files", () => {
    const root = path.join(fixtures, "windows-package-invalid");
    const found = findNativeModules(root);
    assert.equal(found.length, 1);
    assert.match(found[0], /better_sqlite3\.node$/);
  });
});

describe("PHASE 64.1 live Linux artifact detection", () => {
  it("detects ELF better_sqlite3 from host gateway install when present", () => {
    const live = path.join(
      here,
      "..",
      "..",
      "gateway",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    );
    let buf;
    try {
      buf = readFileSync(live);
    } catch {
      // Skip if not installed — CI windows may still have PE here.
      return;
    }
    const d = detectBinaryFormat(buf);
    if (process.platform === "linux") {
      assert.equal(d.format, "ELF");
      const fakeRoot = path.join(fixtures, "windows-package-invalid");
      const result = validateWindowsNativeModules(fakeRoot, { log: () => {} });
      assert.equal(result.ok, false);
    } else if (process.platform === "win32") {
      assert.equal(d.format, "PE");
    }
  });
});
