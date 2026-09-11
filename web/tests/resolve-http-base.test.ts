import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHttpBase } from "../src/api/http.ts";

describe("resolveHttpBase", () => {
  it("returns trimmed httpBase when set", () => {
    assert.equal(
      resolveHttpBase({
        httpBase: "http://127.0.0.1:8787/",
        token: "x",
        deviceId: "d",
        deviceName: "n",
      }),
      "http://127.0.0.1:8787",
    );
  });

  it("falls back to window.location.origin when httpBase empty", () => {
    const prev = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      location: { origin: "http://127.0.0.1:8787" },
    };
    try {
      assert.equal(
        resolveHttpBase({
          httpBase: "",
          token: "",
          deviceId: "d",
          deviceName: "n",
        }),
        "http://127.0.0.1:8787",
      );
    } finally {
      // @ts-expect-error restore
      globalThis.window = prev;
    }
  });
});
