/**
 * Protocolo personal-agent v1 — espejo TypeScript.
 * Fuente de verdad: PROTOCOL.md. Este archivo se adapta a él, nunca al revés.
 */
import { z } from "zod";

// ── Cliente → Servidor ────────────────────────────────────────────────

export const AuthMessage = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  authKind: z.enum(["install", "device"]).optional(),
});

export const PairingRequestMessage = z.object({
  type: z.literal("pairing_request"),
  pairingSessionId: z.string().min(1),
  pairingSecret: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
});

export const UserMessage = z.object({
  type: z.literal("user_message"),
  text: z.string().min(1),
  conversationId: z.string().optional(),
});

export const ConfirmResponseMessage = z.object({
  type: z.literal("confirm_response"),
  confirmationId: z.string().min(1),
  approved: z.boolean(),
});

export const PingMessage = z.object({ type: z.literal("ping") });

export const ClientMessage = z.discriminatedUnion("type", [
  AuthMessage,
  PairingRequestMessage,
  UserMessage,
  ConfirmResponseMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
export type AuthMessage = z.infer<typeof AuthMessage>;
export type PairingRequestMessage = z.infer<typeof PairingRequestMessage>;
export type UserMessage = z.infer<typeof UserMessage>;
export type ConfirmResponseMessage = z.infer<typeof ConfirmResponseMessage>;

// ── Servidor → Cliente ────────────────────────────────────────────────

export type ErrorCode =
  | "auth_failed"
  | "auth_required"
  | "bad_message"
  | "busy"
  | "internal"
  | "pairing_invalid"
  | "pairing_expired"
  | "pairing_rejected"
  | "pairing_waiter_busy";

export type DiagnosticPayload = {
  diagnosticId: string;
  component: string;
  stage: string;
  errorCode: string;
  timestamp: string;
  provider?: string;
  httpStatus?: number;
};

export type ServerMessage =
  | { type: "auth_ok"; deviceId: string }
  | {
      type: "pairing_pending";
      pairingSessionId: string;
      message: string;
    }
  | {
      type: "pairing_result";
      pairingSessionId: string;
      status: "approved" | "rejected" | "expired";
      deviceCredential?: string;
    }
  | { type: "assistant_chunk"; text: string; conversationId?: string }
  | { type: "assistant_done"; messageId: string; conversationId: string }
  | {
      type: "confirm_request";
      confirmationId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      conversationId: string;
    }
  | { type: "pong" }
  | {
      type: "error";
      code: ErrorCode;
      message: string;
      conversationId?: string;
      diagnostic?: DiagnosticPayload;
    };
