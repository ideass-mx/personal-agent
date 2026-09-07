/**
 * Protocolo personal-agent v1 — espejo TypeScript.
 * Fuente de verdad: PROTOCOL.md. Este archivo se adapta a él, nunca al revés.
 */
import { z } from "zod";

// ── Cliente → Servidor ────────────────────────────────────────────────

export const DeviceAuthChallengeRequestMessage = z.object({
  type: z.literal("device_auth_challenge"),
  deviceId: z.string().min(1),
});

export const AuthMessage = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  authKind: z.enum(["install", "device", "device_crypto"]).optional(),
  /** Required when authKind is device_crypto (PHASE 57.8). */
  challengeId: z.string().min(1).optional(),
});

export const PairingRequestMessage = z.object({
  type: z.literal("pairing_request"),
  pairingSessionId: z.string().min(1),
  pairingSecret: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
  /** SPKI DER base64 (Ed25519). Private key never sent. */
  publicKey: z.string().min(1).optional(),
  keyAlgorithm: z.literal("Ed25519").optional(),
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
  DeviceAuthChallengeRequestMessage,
  AuthMessage,
  PairingRequestMessage,
  UserMessage,
  ConfirmResponseMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
export type DeviceAuthChallengeRequestMessage = z.infer<
  typeof DeviceAuthChallengeRequestMessage
>;
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
  | "pairing_waiter_busy"
  | "device_auth_failed"
  | "device_auth_replay";

export type DiagnosticPayload = {
  diagnosticId: string;
  component: string;
  stage: string;
  errorCode: string;
  timestamp: string;
  provider?: string;
  httpStatus?: number;
  providerErrorType?: string;
  providerRequestId?: string;
  safeMessage?: string;
  model?: string;
};

export type ServerMessage =
  | { type: "auth_ok"; deviceId: string }
  | {
      type: "device_auth_challenge";
      deviceId: string;
      challengeId: string;
      challenge: string;
      expiresAt: string;
    }
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
