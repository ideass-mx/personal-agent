import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capabilityFor,
  isHiddenTool,
  labelForTool,
  MVP_CAPABILITIES,
} from "../src/lib/capabilities.ts";
import {
  humanizeError,
  maskToken,
  sanitizeDiagnostics,
  sanitizeInputSummary,
} from "../src/lib/sanitize.ts";
import { toolActivityLabel } from "../src/lib/toolActivity.ts";
import { toWsUrl } from "../src/websocket/HubSocket.ts";

describe("capabilities", () => {
  it("maps six MVP capabilities", () => {
    assert.equal(MVP_CAPABILITIES.length, 8);
    assert.equal(labelForTool("filesystem.write"), "Escribir archivos");
    assert.equal(capabilityFor("process.execute")?.requiresConfirmation, true);
    assert.equal(isHiddenTool("math.add"), true);
  });
});

describe("sanitize", () => {
  it("redacts sensitive keys and masks tokens", () => {
    const s = sanitizeInputSummary({ path: "/a", HUB_TOKEN: "secret-value" });
    assert.doesNotMatch(s, /secret-value/);
    assert.match(maskToken("abcdefghijklmnop"), /abcd…mnop/);
    const d = sanitizeDiagnostics("HUB_TOKEN=abc Authorization: Bearer xyz");
    assert.match(d, /\[redacted\]/);
    assert.doesNotMatch(d, /\bxyz\b/);
  });

  it("humanizes agent errors", () => {
    assert.match(
      humanizeError("agent_disconnected"),
      /no está disponible/i,
    );
    assert.match(
      humanizeError("LLM_TIMEOUT"),
      /tardó demasiado/i,
    );
    assert.match(
      humanizeError("LLM_PROVIDER_UNAVAILABLE", "high demand"),
      /saturado|alta demanda/i,
    );
  });
});

describe("tool activity", () => {
  it("labels phases in Spanish", () => {
    assert.equal(toolActivityLabel("awaiting_auth"), "Esperando autorización…");
    assert.equal(toolActivityLabel("rejected"), "Acción rechazada");
  });

  it("formats precise tool_progress banners", async () => {
    const { toolProgressBanner } = await import("../src/lib/toolActivity.ts");
    assert.match(
      toolProgressBanner({
        phase: "executing",
        toolLabel: "Buscando en la web",
        detail: "doctorados en Tlaxcala",
      }),
      /Buscando en la web….*doctorados/,
    );
    assert.match(
      toolProgressBanner({
        phase: "completed",
        toolLabel: "Buscando en la web",
      }),
      /listo/i,
    );
  });
});

describe("websocket url", () => {
  it("maps http base to /ws without query", () => {
    assert.equal(toWsUrl("http://192.168.1.5:8787"), "ws://192.168.1.5:8787/ws");
    assert.equal(toWsUrl("https://example.test"), "wss://example.test/ws");
  });
});
