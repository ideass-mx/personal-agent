import type { Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ClientMessage,
  type ServerMessage,
  type UserMessage,
} from "../../../packages/protocol/messages.ts";
import type { AgentRuntime } from "../agents/runtime.ts";
import { createConfirmationWaiter } from "../sessions/confirmation-waiter.ts";
import { config } from "../config.ts";
import { touchDevice, ensureConversation } from "../memory/history.ts";
import { createSession, dropSession, type Session } from "../sessions/index.ts";
import {
  acceptPairingRequest,
  touchTrustedDevice,
  verifyDeviceCredential,
} from "../pairing/store.ts";
import {
  dropPairingWaiterByWs,
  registerPairingWaiter,
} from "../pairing/waiters.ts";

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function installTokenMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.hubToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function attachGateway(server: Server, runtime: AgentRuntime): void {
  async function reply(session: Session, msg: UserMessage): Promise<void> {
    session.replying = true;
    const waiter = createConfirmationWaiter({
      sessionId: session.id,
      deviceId: session.deviceId,
    });
    session.confirmationWaiter = waiter;
    const conversationId = ensureConversation(msg.conversationId);
    try {
      for await (const event of runtime.runTurn({
        conversationId,
        deviceId: session.deviceId,
        sessionId: session.id,
        userMessage: msg.text,
        confirmation: waiter.port,
      })) {
        switch (event.type) {
          case "text_delta":
            send(session.ws, {
              type: "assistant_chunk",
              text: event.text,
              conversationId,
            });
            break;
          case "confirm_request":
            send(session.ws, {
              type: "confirm_request",
              confirmationId: event.confirmationId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
              conversationId: event.conversationId,
            });
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
              conversationId,
            });
            break;
        }
      }
    } finally {
      waiter.cancelAll();
      session.confirmationWaiter = undefined;
      session.replying = false;
    }
  }

  function handleAuth(session: Session, parsed: Extract<
    import("../../../packages/protocol/messages.ts").ClientMessage,
    { type: "auth" }
  >): void {
    const kind = parsed.authKind ?? "install";
    let ok = false;
    if (kind === "device") {
      ok = verifyDeviceCredential(parsed.deviceId, parsed.token);
      if (ok) touchTrustedDevice(parsed.deviceId);
    } else {
      // Legacy install credential (HUB_TOKEN / env) — compatibility path.
      ok = installTokenMatches(parsed.token);
    }
    if (!ok) {
      send(session.ws, {
        type: "error",
        code: "auth_failed",
        message: "Credencial inválida.",
      });
      session.ws.close();
      return;
    }
    session.authenticated = true;
    session.deviceId = parsed.deviceId;
    session.deviceName = parsed.deviceName;
    touchDevice(parsed.deviceId, parsed.deviceName);
    send(session.ws, { type: "auth_ok", deviceId: parsed.deviceId });
    console.log(
      `[gateway] dispositivo conectado: ${parsed.deviceId} (authKind=${kind})`,
    );
  }

  function handlePairingRequest(
    session: Session,
    parsed: Extract<
      import("../../../packages/protocol/messages.ts").ClientMessage,
      { type: "pairing_request" }
    >,
  ): void {
    const result = acceptPairingRequest({
      pairingSessionId: parsed.pairingSessionId,
      pairingSecret: parsed.pairingSecret,
      deviceId: parsed.deviceId,
      deviceName: parsed.deviceName,
      platform: parsed.platform,
    });
    if (!result.ok) {
      send(session.ws, {
        type: "error",
        code: result.code,
        message: result.message,
      });
      session.ws.close();
      return;
    }
    const waiter = registerPairingWaiter(parsed.pairingSessionId, {
      ws: session.ws,
      deviceId: parsed.deviceId,
      pairingSessionId: parsed.pairingSessionId,
    });
    if (!waiter.ok) {
      send(session.ws, {
        type: "error",
        code: waiter.code,
        message: waiter.message,
      });
      session.ws.close();
      return;
    }
    send(session.ws, {
      type: "pairing_pending",
      pairingSessionId: parsed.pairingSessionId,
      message: "Esperando confirmación en el PC",
    });
    console.log(
      `[gateway] pairing pendiente: session=${parsed.pairingSessionId} device=${parsed.deviceId}`,
    );
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

    if (!session.authenticated) {
      if (parsed.type === "auth") {
        handleAuth(session, parsed);
        return;
      }
      if (parsed.type === "pairing_request") {
        handlePairingRequest(session, parsed);
        return;
      }
      send(session.ws, {
        type: "error",
        code: "auth_required",
        message: "Envía `auth` o `pairing_request` antes que cualquier otro mensaje.",
      });
      session.ws.close();
      return;
    }

    switch (parsed.type) {
      case "ping":
        send(session.ws, { type: "pong" });
        return;
      case "confirm_response": {
        const waiter = session.confirmationWaiter;
        const ok =
          !!waiter &&
          waiter.respond(parsed.confirmationId, parsed.approved, {
            sessionId: session.id,
            deviceId: session.deviceId,
          });
        if (!ok) {
          send(session.ws, {
            type: "error",
            code: "bad_message",
            message:
              "Confirmación desconocida, ya resuelta o sin turno pendiente.",
          });
        }
        return;
      }
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
      case "pairing_request":
        return;
    }
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const session = createSession(ws);
    ws.on("message", (data) => handleMessage(session, data.toString()));
    ws.on("close", () => {
      dropPairingWaiterByWs(ws);
      if (session.deviceId)
        console.log(`[gateway] dispositivo desconectado: ${session.deviceId}`);
      dropSession(ws);
    });
    ws.on("error", () => {
      dropPairingWaiterByWs(ws);
      dropSession(ws);
    });
  });
}
