import type { Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ClientMessage,
  type ServerMessage,
  type UserMessage,
} from "../../../packages/protocol/messages.ts";
import type { AgentRuntime } from "../agent/runtime.ts";
import { config } from "../config.ts";
import { touchDevice } from "../memory/history.ts";
import { createSession, dropSession, type Session } from "./sessions.ts";

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function tokenMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.hubToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function attachGateway(server: Server, runtime: AgentRuntime): void {
  async function reply(session: Session, msg: UserMessage): Promise<void> {
    session.replying = true;
    try {
      for await (const event of runtime.runTurn({
        conversationId: msg.conversationId,
        deviceId: session.deviceId,
        userMessage: msg.text,
      })) {
        switch (event.type) {
          case "text_delta":
            send(session.ws, { type: "assistant_chunk", text: event.text });
            break;
          case "done":
            send(session.ws, {
              type: "assistant_done",
              messageId: event.messageId,
              conversationId: event.conversationId,
            });
            break;
          case "error":
            send(session.ws, {
              type: "error",
              code: "internal",
              message: event.message,
            });
            break;
        }
      }
    } finally {
      session.replying = false;
    }
  }

  function handleMessage(session: Session, raw: string): void {
    let parsed: ClientMessage;
    try {
      parsed = ClientMessage.parse(JSON.parse(raw));
    } catch {
      send(session.ws, {
        type: "error",
        code: "bad_message",
        message: "Mensaje inválido según el protocolo v1.",
      });
      return;
    }

    // Primera obligación del cliente: autenticarse.
    if (!session.authenticated) {
      if (parsed.type !== "auth") {
        send(session.ws, {
          type: "error",
          code: "auth_required",
          message: "Envía `auth` antes que cualquier otro mensaje.",
        });
        session.ws.close();
        return;
      }
      if (!tokenMatches(parsed.token)) {
        send(session.ws, {
          type: "error",
          code: "auth_failed",
          message: "Token inválido.",
        });
        session.ws.close();
        return;
      }
      session.authenticated = true;
      session.deviceId = parsed.deviceId;
      session.deviceName = parsed.deviceName;
      touchDevice(parsed.deviceId, parsed.deviceName);
      send(session.ws, { type: "auth_ok", deviceId: parsed.deviceId });
      console.log(`[gateway] dispositivo conectado: ${parsed.deviceId}`);
      return;
    }

    switch (parsed.type) {
      case "ping":
        send(session.ws, { type: "pong" });
        return;
      case "user_message":
        if (session.replying) {
          send(session.ws, {
            type: "error",
            code: "busy",
            message: "El agente aún está respondiendo; espera el assistant_done.",
          });
          return;
        }
        void reply(session, parsed);
        return;
      case "auth":
        return; // ya autenticado; se ignora
    }
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const session = createSession(ws);
    ws.on("message", (data) => handleMessage(session, data.toString()));
    ws.on("close", () => {
      if (session.deviceId)
        console.log(`[gateway] dispositivo desconectado: ${session.deviceId}`);
      dropSession(ws);
    });
    ws.on("error", () => dropSession(ws));
  });
}
