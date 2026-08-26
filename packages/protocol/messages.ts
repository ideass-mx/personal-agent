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
  UserMessage,
  ConfirmResponseMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;
export type AuthMessage = z.infer<typeof AuthMessage>;
export type UserMessage = z.infer<typeof UserMessage>;
export type ConfirmResponseMessage = z.infer<typeof ConfirmResponseMessage>;

// ── Servidor → Cliente ────────────────────────────────────────────────

export type ErrorCode =
  | "auth_failed"
  | "auth_required"
  | "bad_message"
  | "busy"
  | "internal";

export type ServerMessage =
  | { type: "auth_ok"; deviceId: string }
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
  | { type: "error"; code: ErrorCode; message: string; conversationId?: string };
