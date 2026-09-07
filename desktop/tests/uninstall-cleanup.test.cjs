"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const issPath = path.join(
  __dirname,
  "..",
  "..",
  "installer",
  "windows",
  "personal-agent.iss",
);

describe("PHASE 58 uninstall secret cleanup (Inno)", () => {
  it("optional cleanup deletes credentials, device-identity, objects, runtime", () => {
    const src = fs.readFileSync(issPath, "utf8");
    assert.match(src, /function InitializeUninstall/);
    assert.match(src, /DelTree\(ExpandConstant\('\{localappdata\}\\Ideass\\PersonalAgent\\config'\)/);
    assert.match(src, /DelTree\(ExpandConstant\('\{localappdata\}\\Ideass\\PersonalAgent\\data'\)/);
    assert.match(src, /DelTree\(ExpandConstant\('\{localappdata\}\\Ideass\\PersonalAgent\\credentials'\)/);
    assert.match(
      src,
      /DelTree\(ExpandConstant\('\{localappdata\}\\Ideass\\PersonalAgent\\device-identity'\)/,
    );
    assert.match(src, /DelTree\(ExpandConstant\('\{localappdata\}\\Ideass\\PersonalAgent\\objects'\)/);
    assert.match(src, /workspace NUNCA se borra/i);
  });
});
