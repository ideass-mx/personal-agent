/**
 * PHASE 57 — MCP Result fidelity (sin Artifact automático).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentToolResultToMcp,
  normalizeMcpResult,
} from "../../src/mcp-result/index.ts";
import { extractResources } from "../../src/resources/index.ts";

describe("PHASE 57 MCP Result fidelity", () => {
  it("text-only MCP result no implica Artifact; content preservado", () => {
    const raw = {
      content: [{ type: "text", text: "hello" }],
    };
    const n = normalizeMcpResult(raw);
    assert.equal(n.content.length, 1);
    assert.equal(n.content[0]?.type, "text");
    if (n.content[0]?.type === "text") assert.equal(n.content[0].text, "hello");
    assert.equal(n.isError, undefined);
    assert.deepEqual(extractResources(n), []);
  });

  it("structuredContent se conserva", () => {
    const structured = { papers: [{ id: 1, title: "A" }], total: 1 };
    const n = normalizeMcpResult({
      content: [{ type: "text", text: "found" }],
      structuredContent: structured,
    });
    assert.deepEqual(n.structuredContent, structured);
  });

  it("resource_link se conserva como Resource external; no Artifact", () => {
    const n = normalizeMcpResult({
      content: [
        {
          type: "resource_link",
          uri: "https://example.com/paper.pdf",
          name: "paper.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    assert.equal(n.content[0]?.type, "resource_link");
    const resources = extractResources(n);
    assert.equal(resources.length, 1);
    assert.equal(resources[0]?.kind, "external");
    assert.equal(resources[0]?.uri, "https://example.com/paper.pdf");
    // Determinismo de id
    const again = extractResources(n);
    assert.equal(again[0]?.id, resources[0]?.id);
  });

  it("image block preservado", () => {
    const n = normalizeMcpResult({
      content: [
        {
          type: "image",
          data: "AAA=",
          mimeType: "image/png",
        },
      ],
    });
    assert.equal(n.content[0]?.type, "image");
    if (n.content[0]?.type === "image") {
      assert.equal(n.content[0].data, "AAA=");
      assert.equal(n.content[0].mimeType, "image/png");
    }
  });

  it("isError preservado", () => {
    const n = normalizeMcpResult({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
    assert.equal(n.isError, true);
  });

  it("AgentTool ToolResult bridge no crea resources", () => {
    const n = agentToolResultToMcp({
      ok: true,
      content: { path: "/tmp/x", bytes: 3 },
    });
    assert.equal(n.isError, undefined);
    assert.ok(n.structuredContent);
    assert.deepEqual(extractResources(n), []);
  });
});
