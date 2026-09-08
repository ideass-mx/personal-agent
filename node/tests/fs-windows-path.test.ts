import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWindowsDriveRoot,
  normalizeWindowsFsPath,
  windowsDriveRootReadCandidates,
} from "../src/tools/fs-windows-path.ts";

describe("fs-windows-path", () => {
  it("normaliza C: y C:/ a raíz de unidad", () => {
    assert.equal(normalizeWindowsFsPath("C:"), "C:\\");
    assert.equal(normalizeWindowsFsPath("c:/"), "C:\\");
    assert.equal(normalizeWindowsFsPath("C:\\"), "C:\\");
    assert.equal(normalizeWindowsFsPath("C:\\\\"), "C:\\");
  });

  it("normaliza C:Users sin barra", () => {
    assert.equal(normalizeWindowsFsPath("C:Users\\Tony"), "C:\\Users\\Tony");
  });

  it("detecta raíz de unidad", () => {
    assert.equal(isWindowsDriveRoot("C:"), true);
    assert.equal(isWindowsDriveRoot("C:\\"), true);
    assert.equal(isWindowsDriveRoot("C:\\Users"), false);
  });

  it("candidatos de readdir incluyen X:\\.", () => {
    assert.deepEqual(windowsDriveRootReadCandidates("C:"), [
      "C:\\",
      "C:\\.",
    ]);
  });
});
