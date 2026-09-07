import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listTrustedDevices,
  revokeTrustedDevice,
} from "../src/api/devices.ts";

describe("devices API client", () => {
  it("listTrustedDevices parses Gateway payload", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          devices: [
            {
              deviceId: "d1",
              name: "Phone",
              platform: "android",
              status: "ACTIVE",
              pairedAt: "2026-01-01T00:00:00.000Z",
              lastSeen: null,
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const rows = await listTrustedDevices("", "token");
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.deviceId, "d1");
      assert.equal(rows[0]?.status, "ACTIVE");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("revokeTrustedDevice posts and returns status", async () => {
    const original = globalThis.fetch;
    let method = "";
    let url = "";
    globalThis.fetch = (async (input, init) => {
      url = String(input);
      method = String(init?.method || "GET");
      return new Response(
        JSON.stringify({
          ok: true,
          deviceId: "d1",
          status: "REVOKED",
          alreadyRevoked: false,
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const out = await revokeTrustedDevice("http://127.0.0.1:8787", "t", "d1");
      assert.equal(method, "POST");
      assert.match(url, /\/v1\/devices\/d1\/revoke/);
      assert.equal(out.status, "REVOKED");
    } finally {
      globalThis.fetch = original;
    }
  });
});
