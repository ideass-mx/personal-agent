import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import {
  createConfirmationWaiter,
} from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool } from "../../src/tools/types.ts";
import { ClientMessage } from "../../../packages/protocol/messages.ts";

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      if (conversationId && conversations.has(conversationId)) {
        return conversationId;
      }
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content });
      return id;
    },
    getHistory(conversationId): HistoryEntry[] {
      return messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
    },
  };
}

function createScriptedLLM(
  steps: Array<(request: LLMRequest) => LLMEvent[]>,
): LLMProvider {
  let index = 0;
  return {
    async *stream(request) {
      const step = steps[index];
      if (!step) throw new Error(`FakeLLM: no hay paso ${index}`);
      index += 1;
      for (const event of step(request)) yield event;
    },
  };
}

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  onConfirm: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm(event);
  }
  return out;
}

function countingConfirmTool(name: string, box: { n: number }): AgentTool {
  return {
    name,
    description: "confirm",
    inputSchema: { type: "object", additionalProperties: true },
    executionMode: "confirm",
    async execute() {
      box.n += 1;
      return { ok: true, content: { n: box.n } };
    },
  };
}

describe("7G confirmation fail-closed", () => {
  it("el cliente no puede inyectar toolName/input/toolCallId en confirm_response", () => {
    const msg = ClientMessage.parse({
      type: "confirm_response",
      confirmationId: "cf_1",
      approved: true,
      toolName: "filesystem.write",
      toolCallId: "forged",
      input: { path: "/etc/passwd" },
      conversationId: "c_forged",
    });
    assert.equal(msg.type, "confirm_response");
    if (msg.type === "confirm_response") {
      assert.equal(msg.confirmationId, "cf_1");
      assert.equal(msg.approved, true);
      assert.equal("toolName" in msg, false);
      assert.equal("input" in msg, false);
      assert.equal("toolCallId" in msg, false);
    }
  });

  it("approve+reject concurrentes: exactamente una decisión y ≤1 ejecución", async () => {
    const box = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(countingConfirmTool("test.confirm", box));
    const waiter = createConfirmationWaiter({
      sessionId: "ws_g",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_cr",
          name: "test.confirm",
          input: { path: "/safe" },
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "x" }, { type: "done" }],
    ]);
    const runtime = createAgentRuntime({
      memory: createFakeMemory(),
      llm,
      tools,
    });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_cr",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "go",
        confirmation: waiter.port,
      }),
      (req) => {
        const a = waiter.respond(req.confirmationId, true);
        const b = waiter.respond(req.confirmationId, false);
        assert.equal([a, b].filter(Boolean).length, 1);
      },
    );
    assert.ok(box.n === 0 || box.n === 1);
    assert.equal(box.n <= 1, true);
  });

  it("reject+approve concurrentes: como mucho una ejecución", async () => {
    const box = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(countingConfirmTool("test.confirm", box));
    const waiter = createConfirmationWaiter({
      sessionId: "ws_g2",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_rc",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "x" }, { type: "done" }],
    ]);
    const runtime = createAgentRuntime({
      memory: createFakeMemory(),
      llm,
      tools,
    });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_rc",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "go",
        confirmation: waiter.port,
      }),
      (req) => {
        const a = waiter.respond(req.confirmationId, false);
        const b = waiter.respond(req.confirmationId, true);
        assert.equal([a, b].filter(Boolean).length, 1);
      },
    );
    assert.ok(box.n === 0 || box.n === 1);
  });

  it("confirmationId inexistente no ejecuta", async () => {
    const box = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(countingConfirmTool("test.confirm", box));
    const waiter = createConfirmationWaiter({
      sessionId: "ws_g3",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_miss",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "x" }, { type: "done" }],
    ]);
    const runtime = createAgentRuntime({
      memory: createFakeMemory(),
      llm,
      tools,
    });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_miss",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "go",
        confirmation: waiter.port,
      }),
      (req) => {
        assert.equal(waiter.respond("cf_does_not_exist", true), false);
        waiter.cancelAll();
        assert.ok(req.confirmationId);
      },
    );
    assert.equal(box.n, 0);
  });

  it("pending congela toolName/input; respond no los toma del cliente", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_freeze",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait({
      confirmationId: "cf_fr",
      toolCallId: "call_orig",
      toolName: "filesystem.write",
      input: { path: "safe.txt", content: "a" },
      conversationId: "c_fr",
      deviceId: "device-1",
      sessionId: "ws_freeze",
    });
    const snap = waiter.peek("cf_fr");
    assert.equal(snap?.toolName, "filesystem.write");
    assert.equal(snap?.toolCallId, "call_orig");
    assert.deepEqual(snap?.input, { path: "safe.txt", content: "a" });
    assert.equal(waiter.respond("cf_fr", false), true);
    const outcome = await pending;
    assert.equal(outcome.decision, "rejected");
    assert.equal(outcome.operation.toolName, "filesystem.write");
    assert.deepEqual(outcome.operation.input, {
      path: "safe.txt",
      content: "a",
    });
  });
});
