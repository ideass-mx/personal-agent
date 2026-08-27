import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHttpBase } from "../src/api/http.ts";

describe("http client", () => {
  it("resolveHttpBase strips trailing slash", () => {
    assert.equal(
      resolveHttpBase({
        httpBase: "http://127.0.0.1:8787/",
        token: "t",
        deviceId: "d",
        deviceName: "n",
      }),
      "http://127.0.0.1:8787",
    );
    assert.equal(
      resolveHttpBase({
        httpBase: "",
        token: "t",
        deviceId: "d",
        deviceName: "n",
      }),
      "",
    );
  });
});
