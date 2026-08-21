import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createAgentRuntime,
  type AgentEvent,
  type ReplyStreamer,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";

function createFakeMemory(): TurnMemory & {
  messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    deviceId?: string;
  }>;
  lastHistoryPassed?: HistoryEntry[];
} {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    deviceId?: string;
  }> = [];

  const memory: TurnMemory & {
    messages: typeof messages;
    lastHistoryPassed?: HistoryEntry[];
  } = {
    messages,
    ensureConversation(conversationId?: string): string {
      if (conversationId && conversations.has(conversationId)) {
        return conversationId;
      }
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content, deviceId): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content, deviceId });
      return id;
    },
    getHistory(conversationId): HistoryEntry[] {
      const history = messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
      memory.lastHistoryPassed = history;
      return history;
    },
  };

  return memory;
}

async function collect(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("AgentRuntime.runTurn", () => {
  it("persiste el mensaje del usuario, streamea text_delta, persiste assistant y emite done", async () => {
    const memory = createFakeMemory();
    const historiesSeen: HistoryEntry[][] = [];

    const streamReply: ReplyStreamer = async function* (history) {
      historiesSeen.push(history);
      yield "Hola";
      yield " mundo";
    };

    const runtime = createAgentRuntime({ memory, streamReply });
    const events = await collect(
      runtime.runTurn({
        conversationId: "c_test",
        deviceId: "device-1",
        userMessage: "saluda",
      }),
    );

    assert.equal(memory.messages[0]?.role, "user");
    assert.equal(memory.messages[0]?.content, "saluda");
    assert.equal(memory.messages[0]?.deviceId, "device-1");
    assert.equal(memory.messages[0]?.conversationId, "c_test");

    assert.deepEqual(historiesSeen[0], [
      { role: "user", content: "saluda" },
    ]);

    assert.deepEqual(
      events.filter((e) => e.type === "text_delta"),
      [
        { type: "text_delta", text: "Hola" },
        { type: "text_delta", text: " mundo" },
      ],
    );

    const assistant = memory.messages.find((m) => m.role === "assistant");
    assert.ok(assistant);
    assert.equal(assistant.content, "Hola mundo");

    const done = events.find((e) => e.type === "done");
    assert.ok(done && done.type === "done");
    assert.equal(done.conversationId, "c_test");
    assert.equal(done.messageId, assistant.id);
  });

  it("pasa al streamer el historial completo de la conversación", async () => {
    const memory = createFakeMemory();
    memory.ensureConversation("c_hist");
    memory.addMessage("c_hist", "user", "primero");
    memory.addMessage("c_hist", "assistant", "respuesta 1");

    let received: HistoryEntry[] | undefined;
    const streamReply: ReplyStreamer = async function* (history) {
      received = history;
      yield "ok";
    };

    const runtime = createAgentRuntime({ memory, streamReply });
    await collect(
      runtime.runTurn({
        conversationId: "c_hist",
        userMessage: "segundo",
      }),
    );

    assert.deepEqual(received, [
      { role: "user", content: "primero" },
      { role: "assistant", content: "respuesta 1" },
      { role: "user", content: "segundo" },
    ]);
  });

  it("convierte errores del streamer en evento error sin done", async () => {
    const memory = createFakeMemory();
    const streamReply: ReplyStreamer = async function* () {
      yield "parcial";
      throw new Error("boom anthropic");
    };

    const runtime = createAgentRuntime({ memory, streamReply });
    const events = await collect(
      runtime.runTurn({ userMessage: "hola" }),
    );

    assert.equal(memory.messages.filter((m) => m.role === "user").length, 1);
    assert.equal(
      memory.messages.filter((m) => m.role === "assistant").length,
      0,
    );

    assert.ok(events.some((e) => e.type === "text_delta"));
    const err = events.find((e) => e.type === "error");
    assert.ok(err && err.type === "error");
    assert.match(err.message, /problema generando la respuesta/);
    assert.equal(events.some((e) => e.type === "done"), false);
  });

  it("crea conversación nueva si no se envía conversationId", async () => {
    const memory = createFakeMemory();
    const streamReply: ReplyStreamer = async function* () {
      yield "x";
    };

    const runtime = createAgentRuntime({ memory, streamReply });
    const events = await collect(
      runtime.runTurn({ userMessage: "nuevo" }),
    );

    const done = events.find((e) => e.type === "done");
    assert.ok(done && done.type === "done");
    assert.match(done.conversationId, /^c_/);
    assert.equal(memory.messages[0]?.conversationId, done.conversationId);
  });
});
