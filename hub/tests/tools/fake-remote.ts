import type {
  RemoteToolExecutor,
  RemoteToolRequest,
  RemoteToolResponse,
} from "../../src/tools/remote.ts";
import type { ToolResult } from "../../src/tools/types.ts";

/**
 * Fake de la frontera remota (solo tests).
 * No es el Agent de producción ni un transporte.
 */
export function createFakeRemoteExecutor(opts: {
  handle: (request: RemoteToolRequest) => ToolResult | Promise<ToolResult>;
  onRequest?: (request: RemoteToolRequest) => void;
}): RemoteToolExecutor & { calls: number } {
  const state = { calls: 0 };
  const executor: RemoteToolExecutor & { calls: number } = {
    get calls() {
      return state.calls;
    },
    async execute(request: RemoteToolRequest): Promise<RemoteToolResponse> {
      state.calls += 1;
      opts.onRequest?.(request);
      const result = await opts.handle(request);
      return { requestId: request.requestId, result };
    },
  };
  return executor;
}

/** FakeAgent mínimo: echo { text } para test.remote.echo. */
export function fakeEchoAgent(request: RemoteToolRequest): ToolResult {
  if (request.toolName !== "test.remote.echo") {
    return {
      ok: false,
      error: {
        code: "unknown_tool",
        message: `FakeAgent no conoce ${request.toolName}`,
      },
    };
  }
  const input = request.input;
  if (
    typeof input !== "object" ||
    input === null ||
    !("text" in input) ||
    typeof (input as { text: unknown }).text !== "string"
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Se espera { text: string }.",
      },
    };
  }
  return { ok: true, content: { text: (input as { text: string }).text } };
}
