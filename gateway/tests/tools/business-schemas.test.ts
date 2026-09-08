import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUSINESS_TOOL_INPUT_SCHEMAS,
  looksLikeRemoteEnvelopeSchema,
  resolveLlmInputSchema,
} from "../../src/tools/business-schemas.ts";

describe("business schemas for LLM (E-29-01)", () => {
  it("detecta envelope MCP y sustituye schema de filesystem.list", () => {
    const envelope = {
      type: "object",
      properties: {
        requestId: { type: "string" },
        context: { type: "object" },
        input: {},
      },
    };
    assert.equal(looksLikeRemoteEnvelopeSchema(envelope), true);
    const resolved = resolveLlmInputSchema("filesystem.list", envelope);
    assert.equal(resolved, BUSINESS_TOOL_INPUT_SCHEMAS["filesystem.list"]);
    const props = (resolved as { properties: { path: unknown } }).properties;
    assert.ok(props.path);
    assert.equal(
      looksLikeRemoteEnvelopeSchema(resolved),
      false,
    );
  });
});
