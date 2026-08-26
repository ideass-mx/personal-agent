import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRemoteAgentTool,
  REMOTE_TOOL_ERROR_CODE,
  type RemoteToolExecutor,
} from "../../src/tools/remote.ts";

describe("createRemoteAgentTool", () => {
  it("delega al executor y devuelve el ToolResult", async () => {
    const executor: RemoteToolExecutor = {
      async execute(request) {
        return {
          requestId: request.requestId,
          result: { ok: true, content: { echo: request.input } },
        };
      },
    };
    const tool = createRemoteAgentTool({
      name: "agent.echo",
      description: "echo",
      inputSchema: { type: "object" },
      executionMode: "automatic",
      executor,
    });
    const result = await tool.execute(
      { text: "hola" },
      { conversationId: "c1" },
    );
    assert.deepEqual(result, { ok: true, content: { echo: { text: "hola" } } });
  });

  it("no reintenta si el executor falla", async () => {
    let calls = 0;
    const executor: RemoteToolExecutor = {
      async execute() {
        calls += 1;
        throw new Error("boom");
      },
    };
    const tool = createRemoteAgentTool({
      name: "filesystem.read",
      description: "read",
      inputSchema: { type: "object" },
      executionMode: "automatic",
      executor,
    });
    const first = await tool.execute({ path: "a" }, { conversationId: "c" });
    const second = await tool.execute({ path: "b" }, { conversationId: "c" });
    assert.equal(calls, 2);
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    if (!first.ok) assert.equal(first.error.code, REMOTE_TOOL_ERROR_CODE);
  });

  it("rechaza respuesta con requestId distinto", async () => {
    const executor: RemoteToolExecutor = {
      async execute() {
        return {
          requestId: "otro",
          result: { ok: true, content: 1 },
        };
      },
    };
    const tool = createRemoteAgentTool({
      name: "x",
      description: "x",
      inputSchema: {},
      executionMode: "automatic",
      executor,
    });
    const result = await tool.execute({}, { conversationId: "c" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, REMOTE_TOOL_ERROR_CODE);
  });
});
