/**
 * Persistencia de sesión de consola (localStorage durable).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("console session persistence", () => {
  it("stores session in localStorage so it survives browser restart", () => {
    const src = fs.readFileSync(
      path.join(root, "src/state/session.ts"),
      "utf8",
    );
    assert.match(src, /localStorage\.setItem/);
    assert.match(src, /localStorage\.getItem/);
    assert.match(src, /sessionStorage/);
    assert.match(src, /migrate|fromSession|sessionStorage\.getItem/i);
  });

  it("host bootstrap HTML writes localStorage and sessionStorage", () => {
    const src = fs.readFileSync(
      path.join(
        root,
        "../gateway/src/http/browser-session.ts",
      ),
      "utf8",
    );
    assert.match(src, /localStorage\.setItem\("pa_console_session_v1"/);
    assert.match(src, /localStorage\.setItem\("pa_host_bootstrap"/);
    assert.match(src, /sessionStorage\.setItem\("pa_console_session_v1"/);
  });
});
