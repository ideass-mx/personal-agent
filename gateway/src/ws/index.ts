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
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { touchDevice, ensureConversation } from "../memory/history.ts";
import {
  maybeAnnotateConversationAsync,
} from "../memory/conversation-meta.ts";
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
import {
  cookieToken,
} from "../http/bearer-auth.ts";
import {
  BROWSER_AUTH_COOKIE,
  verifyBrowserCookieSession,
} from "../http/browser-session.ts";
import {
  resolveUserContextFromAuthSession,
} from "../identity/context.ts";
import {
  resolveDeviceAuthSession,
  resolveInstallCompatSession,
} from "../identity/auth-session-resolve.ts";
import { isSessionActive } from "../identity/auth-session-store.ts";
import { getAuthSessionById } from "../identity/auth-session-store.ts";
import { isLoopbackAddress, isLoopbackBind } from "../http/remote-access.ts";
import {
  issueDeviceAuthChallenge,
  verifyDeviceAuthSignature,
} from "../identity/device-auth.ts";

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function installTokenMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.hubToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ensure product AuthSession still ACTIVE; else kill connection. */
function requireActiveAuthSession(session: Session): boolean {
  if (!session.authSessionId || !isSessionActive(session.authSessionId)) {
    session.authenticated = false;
    send(session.ws, {
      type: "error",
      code: "auth_failed",
      message: "Sesión revocada o expirada.",
    });
    session.ws.close();
    return false;
  }
  return true;
}

export function attachGateway(
  server: Server,
  runtime: AgentRuntime,
  diagnostics?: SqliteDiagnosticsStore,
): void {
  async function reply(session: Session, msg: UserMessage): Promise<void> {
    if (!requireActiveAuthSession(session)) return;
    const authSession = getAuthSessionById(session.authSessionId!);
    if (!authSession) {
      requireActiveAuthSession(session);
      return;
    }
    const userContext = resolveUserContextFromAuthSession(authSession);

    const diagnosticId = diagnostics?.createDiagnosticId() || "PA-UNKNOWN";
    session.replying = true;
    const waiter = createConfirmationWaiter({
      sessionId: session.id,
      deviceId: session.deviceId,
    });
    session.confirmationWaiter = waiter;
    const conversationId = ensureConversation(msg.conversationId);
    const startedAt = Date.now();
    diagnostics?.record({
      diagnosticId,
      component: "GATEWAY",
      stage: "WEBSOCKET",
      level: "INFO",
      event: "REQUEST_RECEIVED",
      metadata: {
        conversationIdKnown: Boolean(msg.conversationId),
        deviceId: session.deviceId,
        inputLength: msg.text.length,
        authSessionId: session.authSessionId,
      },
    });
    try {
      for await (const event of runtime.runTurn({
        conversationId,
        deviceId: session.deviceId,
        diagnosticId,
        sessionId: session.id,
        userMessage: msg.text,
        userContext,
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
            diagnostics?.record({
              diagnosticId,
              component: "GATEWAY",
              stage: "WEBSOCKET",
              level: "INFO",
              event: "REQUEST_COMPLETED",
              durationMs: Date.now() - startedAt,
            });
            send(session.ws, {
              type: "assistant_done",
              messageId: event.messageId,
              conversationId: event.conversationId,
            });
            // Semantic title/summary: seeds deterministic meta synchronously
            // before any LLM await, then optional upgrade. Never blocks UX.
            void maybeAnnotateConversationAsync(conversationId, msg.text);
            break;
          case "error":
            diagnostics?.record({
              diagnosticId,
              component: "GATEWAY",
              stage: "WEBSOCKET",
              level: "ERROR",
              event: "REQUEST_FAILED",
              errorCode: event.diagnostic?.errorCode || "REQUEST_FAILED",
              durationMs: Date.now() - startedAt,
            });
            send(session.ws, {
              type: "error",
              code: "internal",
              message: event.message,
              conversationId,
              ...(event.diagnostic ? { diagnostic: event.diagnostic } : {}),
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

  function handleAuth(
    session: Session,
    parsed: Extract<
      import("../../../packages/protocol/messages.ts").ClientMessage,
      { type: "auth" }
    >,
  ): void {
    const kind = parsed.authKind ?? "install";
    let ok = false;
    let authSessionId: string | undefined;

    if (kind === "device_crypto") {
      if (!parsed.challengeId) {
        send(session.ws, {
          type: "error",
          code: "device_auth_failed",
          message: "challengeId requerido para device_crypto.",
        });
        session.ws.close();
        return;
      }
      const verified = verifyDeviceAuthSignature({
        deviceId: parsed.deviceId,
        challengeId: parsed.challengeId,
        signatureBase64: parsed.token,
      });
      if (!verified.ok) {
        if (diagnostics) {
          diagnostics.record({
            diagnosticId: diagnostics.createDiagnosticId(),
            component: "GATEWAY",
            stage: "WEBSOCKET",
            level: "WARN",
            event: verified.replay
              ? "DEVICE_AUTH_REPLAY_REJECTED"
              : verified.reason === "revoked"
                ? "DEVICE_AUTH_REVOKED"
                : "DEVICE_AUTH_FAILED",
            metadata: {
              deviceId: parsed.deviceId,
              reason: verified.reason,
              transport: "ws",
            },
          });
        }
        send(session.ws, {
          type: "error",
          code: verified.replay ? "device_auth_replay" : "device_auth_failed",
          message: verified.message,
        });
        session.ws.close();
        return;
      }
      ok = true;
      authSessionId = verified.session.id;
      touchTrustedDevice(parsed.deviceId);
      if (diagnostics) {
        diagnostics.record({
          diagnosticId: diagnostics.createDiagnosticId(),
          component: "GATEWAY",
          stage: "WEBSOCKET",
          level: "INFO",
          event: "DEVICE_AUTH_SUCCESS",
          metadata: {
            deviceId: parsed.deviceId,
            sessionId: verified.session.id,
            transport: "ws",
          },
        });
      }
    } else if (kind === "device") {
      ok = verifyDeviceCredential(parsed.deviceId, parsed.token);
      if (ok) touchTrustedDevice(parsed.deviceId);
    } else {
      // install_compat: LOCAL-ONLY when remote bind is enabled (PHASE 57.7).
      const localPeer =
        isLoopbackBind(config.bindHost) ||
        isLoopbackAddress(session.remoteAddress);
      if (!localPeer) {
        if (diagnostics) {
          diagnostics.record({
            diagnosticId: diagnostics.createDiagnosticId(),
            component: "GATEWAY",
            stage: "WEBSOCKET",
            level: "WARN",
            event: "REMOTE_AUTH_REJECTED",
            metadata: {
              reason: "install_compat_remote_forbidden",
              transport: "ws",
            },
          });
        }
        send(session.ws, {
          type: "error",
          code: "auth_failed",
          message: "Credencial de instalación no válida en acceso remoto.",
        });
        session.ws.close();
        return;
      }
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

    // Identity is immutable once set: refuse re-auth that would change principal.
    if (session.authenticated && session.authSessionId) {
      send(session.ws, {
        type: "error",
        code: "auth_failed",
        message: "La conexión ya está autenticada.",
      });
      return;
    }

    if (kind === "device_crypto") {
      session.authSessionId = authSessionId;
      session.authKind = "device";
    } else if (kind === "device") {
      const { session: authSession } = resolveDeviceAuthSession({
        deviceId: parsed.deviceId,
      });
      session.authSessionId = authSession.id;
      session.authKind = "device";
    } else {
      const { session: authSession } = resolveInstallCompatSession({
        deviceId: parsed.deviceId,
      });
      session.authSessionId = authSession.id;
      session.authKind = "install";
    }

    session.authenticated = true;
    session.deviceId = parsed.deviceId;
    session.deviceName = parsed.deviceName;
    touchDevice(parsed.deviceId, parsed.deviceName);
    if (
      diagnostics &&
      !isLoopbackBind(config.bindHost) &&
      !isLoopbackAddress(session.remoteAddress)
    ) {
      diagnostics.record({
        diagnosticId: diagnostics.createDiagnosticId(),
        component: "GATEWAY",
        stage: "WEBSOCKET",
        level: "INFO",
        event: "REMOTE_SESSION_ACCEPTED",
        metadata: {
          transport: "ws",
          deviceId: parsed.deviceId,
          sessionId: session.authSessionId,
          authKind: kind,
        },
      });
    }
    send(session.ws, { type: "auth_ok", deviceId: parsed.deviceId });
    console.log(
      `[gateway] dispositivo conectado: ${parsed.deviceId} (authKind=${kind})`,
    );
  }

  function handleDeviceAuthChallengeRequest(
    session: Session,
    parsed: Extract<
      import("../../../packages/protocol/messages.ts").ClientMessage,
      { type: "device_auth_challenge" }
    >,
  ): void {
    if (diagnostics) {
      diagnostics.record({
        diagnosticId: diagnostics.createDiagnosticId(),
        component: "GATEWAY",
        stage: "WEBSOCKET",
        level: "INFO",
        event: "DEVICE_AUTH_STARTED",
        metadata: { deviceId: parsed.deviceId, transport: "ws" },
      });
    }
    const issued = issueDeviceAuthChallenge(parsed.deviceId);
    if (!issued.ok) {
      if (diagnostics) {
        diagnostics.record({
          diagnosticId: diagnostics.createDiagnosticId(),
          component: "GATEWAY",
          stage: "WEBSOCKET",
          level: "WARN",
          event:
            issued.reason === "revoked"
              ? "DEVICE_AUTH_REVOKED"
              : "DEVICE_AUTH_FAILED",
          metadata: {
            deviceId: parsed.deviceId,
            reason: issued.reason,
            transport: "ws",
          },
        });
      }
      send(session.ws, {
        type: "error",
        code:
          issued.reason === "revoked" ? "device_auth_failed" : "device_auth_failed",
        message: issued.message,
      });
      session.ws.close();
      return;
    }
    send(session.ws, {
      type: "device_auth_challenge",
      deviceId: issued.deviceId,
      challengeId: issued.challengeId,
      challenge: issued.challenge,
      expiresAt: issued.expiresAt,
    });
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
      publicKey: parsed.publicKey,
      keyAlgorithm: parsed.keyAlgorithm,
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
      if (parsed.type === "device_auth_challenge") {
        handleDeviceAuthChallengeRequest(session, parsed);
        return;
      }
      if (parsed.type === "pairing_request") {
        handlePairingRequest(session, parsed);
        return;
      }
      send(session.ws, {
        type: "error",
        code: "auth_required",
        message:
          "Envía `auth`, `device_auth_challenge` o `pairing_request` antes que cualquier otro mensaje.",
      });
      session.ws.close();
      return;
    }

    if (!requireActiveAuthSession(session)) return;

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
      case "device_auth_challenge":
      case "pairing_request":
        return;
    }
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const session = createSession(ws);
    session.remoteAddress = req.socket?.remoteAddress;
    const browserAuth = verifyBrowserCookieSession(
      cookieToken(req.headers.cookie, BROWSER_AUTH_COOKIE),
    );
    if (browserAuth) {
      session.authenticated = true;
      session.deviceId = browserAuth.deviceId;
      session.deviceName = browserAuth.deviceName;
      session.authKind = "browser";
      session.authSessionId = browserAuth.authSessionId;
      touchDevice(browserAuth.deviceId, browserAuth.deviceName);
      send(session.ws, { type: "auth_ok", deviceId: browserAuth.deviceId });
    }
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
