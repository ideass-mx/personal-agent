import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  createMcpRemoteExecutor,
  REMOTE_TOOL_TIMEOUT_CODE,
} from "../../src/tools/mcp-executor.ts";
import { REMOTE_TOOL_ERROR_CODE } from "../../src/tools/remote.ts";
import type { McpCallToolClient } from "../../src/tools/mcp-executor.ts";
import type { RemoteToolRequest } from "../../src/tools/remote.ts";

const baseRequest = (
  overrides: Partial<RemoteToolRequest> = {},
): RemoteToolRequest => ({
  requestId: "req_1",
  toolName: "filesystem.read",
  input: { path: "a.txt" },
  context: { conversationId: "c1" },
  ...overrides,
});

function textResult(text: string, extra?: { isError?: boolean }) {
  return {
    content: [{ type: "text" as const, text }],
    ...(extra?.isError ? { isError: true } : {}),
  };
}

function envelope(requestId: string, result: unknown): string {
  return JSON.stringify({ requestId, result });
}

describe("7G MCP fail-closed", () => {
  it("requestId incorrecto descarta el payload (no ok:true ajeno)", async () => {
    const client: McpCallToolClient = {
      callTool: async () =>
        textResult(
          envelope("otro_id", { ok: true, content: { secret: "pwned" } }),
        ),
    };
    const executor = createMcpRemoteExecutor(client);
    const out = await executor.execute(baseRequest());
    assert.equal(out.requestId, "req_1");
    assert.equal(out.result.ok, false);
    if (!out.result.ok) {
      assert.equal(out.result.error.code, REMOTE_TOOL_ERROR_CODE);
    }
    assert.doesNotMatch(JSON.stringify(out.result), /pwned/);
  });

  it("respuesta malformada / no JSON falla cerrado", async () => {
    const executor = createMcpRemoteExecutor({
      callTool: async () => textResult("STDOUT BASURA {no json"),
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
  });

  it("ToolResult inválido falla cerrado", async () => {
    const executor = createMcpRemoteExecutor({
      callTool: async () =>
        textResult(envelope("req_1", { ok: true })),
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
  });

  it("MCP isError no se interpreta como éxito", async () => {
    const executor = createMcpRemoteExecutor({
      callTool: async () =>
        textResult("fallo de herramienta", { isError: true }),
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
  });

  it("timeout MCP: error, sin retry, sin ejecución local", async () => {
    let calls = 0;
    const executor = createMcpRemoteExecutor(
      {
        callTool: async () => {
          calls += 1;
          throw new McpError(ErrorCode.RequestTimeout, "timeout");
        },
      },
      { timeoutMs: 50 },
    );
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
    if (!out.result.ok) {
      assert.equal(out.result.error.code, REMOTE_TOOL_TIMEOUT_CODE);
    }
    assert.equal(calls, 1);
  });

  it("proceso/transporte caído: error, no fallback in-process", async () => {
    const executor = createMcpRemoteExecutor({
      callTool: async () => {
        throw new Error("MCP error -32603: Connection closed");
      },
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
    if (!out.result.ok) {
      assert.equal(out.result.error.code, "agent_disconnected");
    }
  });

  it("stdout contaminado (JSON + basura) falla cerrado", async () => {
    const executor = createMcpRemoteExecutor({
      callTool: async () =>
        textResult(
          `${envelope("req_1", { ok: true, content: { x: 1 } })}\nWARN extra`,
        ),
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
  });

  it("error en stderr / excepción de transporte: no retry", async () => {
    let calls = 0;
    const executor = createMcpRemoteExecutor({
      callTool: async () => {
        calls += 1;
        throw new Error("EPIPE: stderr del Agent");
      },
    });
    const out = await executor.execute(baseRequest());
    assert.equal(out.result.ok, false);
    assert.equal(calls, 1);
  });

  it("proceso Agent termina a mitad: fail-closed, una sola llamada", async () => {
    let calls = 0;
    const executor = createMcpRemoteExecutor({
      callTool: async () => {
        calls += 1;
        throw new Error("MCP error -32000: Connection closed");
      },
    });
    const a = await executor.execute(baseRequest());
    const b = await executor.execute(baseRequest({ requestId: "req_2" }));
    assert.equal(a.result.ok, false);
    assert.equal(b.result.ok, false);
    if (!a.result.ok) {
      assert.equal(a.result.error.code, "agent_disconnected");
    }
    assert.equal(calls, 2);
  });

  it("invoca exactamente el toolName solicitado", async () => {
    const names: string[] = [];
    const executor = createMcpRemoteExecutor({
      callTool: async (params) => {
        names.push(String(params.name));
        return textResult(
          envelope("req_1", { ok: true, content: { path: "a.txt" } }),
        );
      },
    });
    await executor.execute(baseRequest({ toolName: "filesystem.read" }));
    assert.deepEqual(names, ["filesystem.read"]);
  });

  it("timeoutMs del request prevalece sobre el default del executor", async () => {
    const timeouts: number[] = [];
    const executor = createMcpRemoteExecutor(
      {
        callTool: async (_params, _extra, options) => {
          timeouts.push((options as { timeout?: number }).timeout ?? -1);
          return textResult(
            envelope("req_1", { ok: true, content: { path: "a.txt" } }),
          );
        },
      },
      { timeoutMs: 15_000 },
    );
    await executor.execute(
      baseRequest({ timeoutMs: 42_000, toolName: "filesystem.read" }),
    );
    assert.deepEqual(timeouts, [42_000]);
  });
});
