/**
 * Cliente HTTP de Workspace (Gateway). Bearer = HUB_TOKEN.
 * No habla WebSocket. No conoce Agent Runtime ni Active Workspace.
 */
import { kindForStatus, WorkspaceHttpError } from "./errors.ts";
import type {
  ConversationCreateInput,
  ConversationMessage,
  ConversationRecord,
  ConversationWorkspaceResult,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "./types.ts";

export type WorkspaceHttpClientOptions = {
  /** Origen del Gateway, p. ej. http://127.0.0.1:8787 */
  baseUrl: string;
  /** Mismo secreto que WS `auth.token` / env HUB_TOKEN. Lo aporta el caller. */
  token: string;
  fetch?: typeof globalThis.fetch;
};

function asConversationMessage(value: unknown): ConversationMessage {
  if (!isRecord(value)) {
    throw new WorkspaceHttpError("gateway", "Respuesta Message inválida.", 500);
  }
  if (
    typeof value.id !== "string" ||
    typeof value.conversationId !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string" ||
    typeof value.createdAt !== "string" ||
    (value.deviceId !== null && typeof value.deviceId !== "string")
  ) {
    throw new WorkspaceHttpError("gateway", "Respuesta Message inválida.", 500);
  }
  return {
    id: value.id,
    conversationId: value.conversationId,
    role: value.role,
    content: value.content,
    deviceId: value.deviceId,
    createdAt: value.createdAt,
  };
}

export type WorkspaceHttpClient = {
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(input: WorkspaceCreateInput): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace>;
  updateWorkspace(id: string, patch: WorkspaceUpdateInput): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  createConversation(input?: ConversationCreateInput): Promise<ConversationRecord>;
  listWorkspaceConversations(workspaceId: string): Promise<ConversationRecord[]>;
  getConversation(id: string): Promise<ConversationRecord>;
  getConversationMessages(conversationId: string): Promise<ConversationMessage[]>;
  getConversationWorkspace(id: string): Promise<Workspace | null>;
  setConversationWorkspace(
    conversationId: string,
    workspaceId: string,
  ): Promise<ConversationWorkspaceResult>;
  clearConversationWorkspace(
    conversationId: string,
  ): Promise<ConversationWorkspaceResult>;
};

type ErrorPayload = {
  error?: { code?: string; message?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asWorkspace(value: unknown): Workspace {
  if (!isRecord(value)) {
    throw new WorkspaceHttpError("gateway", "Respuesta Workspace inválida.", 500);
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    (value.description !== null && typeof value.description !== "string")
  ) {
    throw new WorkspaceHttpError("gateway", "Respuesta Workspace inválida.", 500);
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function asConversation(value: unknown): ConversationRecord {
  if (!isRecord(value)) {
    throw new WorkspaceHttpError("gateway", "Respuesta Conversation inválida.", 500);
  }
  if (
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    (value.title !== null && typeof value.title !== "string") ||
    (value.workspaceId !== null && typeof value.workspaceId !== "string")
  ) {
    throw new WorkspaceHttpError("gateway", "Respuesta Conversation inválida.", 500);
  }
  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    workspaceId: value.workspaceId,
  };
}

export function createWorkspaceHttpClient(
  options: WorkspaceHttpClientOptions,
): WorkspaceHttpClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de red.";
      throw new WorkspaceHttpError("network", message, 0);
    }

    let payload: unknown = undefined;
    const text = await response.text();
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      const errBody = isRecord(payload) ? (payload as ErrorPayload) : undefined;
      const message =
        errBody?.error?.message ?? `HTTP ${response.status}`;
      const code = errBody?.error?.code;
      throw new WorkspaceHttpError(
        kindForStatus(response.status),
        message,
        response.status,
        code,
      );
    }

    return payload;
  }

  return {
    async listWorkspaces() {
      const payload = await request("GET", "/workspaces");
      if (!isRecord(payload) || !Array.isArray(payload.workspaces)) {
        throw new WorkspaceHttpError("gateway", "Lista de Workspace inválida.", 500);
      }
      return payload.workspaces.map(asWorkspace);
    },

    async createWorkspace(input) {
      return asWorkspace(await request("POST", "/workspaces", input));
    },

    async getWorkspace(id) {
      return asWorkspace(
        await request("GET", `/workspaces/${encodeURIComponent(id)}`),
      );
    },

    async updateWorkspace(id, patch) {
      return asWorkspace(
        await request("PATCH", `/workspaces/${encodeURIComponent(id)}`, patch),
      );
    },

    async deleteWorkspace(id) {
      await request("DELETE", `/workspaces/${encodeURIComponent(id)}`);
    },

    async createConversation(input) {
      return asConversation(await request("POST", "/conversations", input ?? {}));
    },

    async listWorkspaceConversations(workspaceId) {
      const payload = await request(
        "GET",
        `/workspaces/${encodeURIComponent(workspaceId)}/conversations`,
      );
      if (!Array.isArray(payload)) {
        throw new WorkspaceHttpError(
          "gateway",
          "Lista de Conversations inválida.",
          500,
        );
      }
      return payload.map(asConversation);
    },

    async getConversation(id) {
      return asConversation(
        await request("GET", `/conversations/${encodeURIComponent(id)}`),
      );
    },

    async getConversationMessages(conversationId) {
      const payload = await request(
        "GET",
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
      );
      if (!Array.isArray(payload)) {
        throw new WorkspaceHttpError(
          "gateway",
          "Lista de Messages inválida.",
          500,
        );
      }
      return payload.map(asConversationMessage);
    },

    async getConversationWorkspace(id) {
      const payload = await request(
        "GET",
        `/conversations/${encodeURIComponent(id)}/workspace`,
      );
      if (!isRecord(payload) || typeof payload.conversationId !== "string") {
        throw new WorkspaceHttpError(
          "gateway",
          "Respuesta de resolución inválida.",
          500,
        );
      }
      if (payload.workspace === null) return null;
      return asWorkspace(payload.workspace);
    },

    async setConversationWorkspace(conversationId, workspaceId) {
      const payload = await request(
        "PATCH",
        `/conversations/${encodeURIComponent(conversationId)}/workspace`,
        { workspaceId },
      );
      if (!isRecord(payload)) {
        throw new WorkspaceHttpError("gateway", "Respuesta de asociación inválida.", 500);
      }
      return {
        conversation: asConversation(payload.conversation),
        workspace: payload.workspace === null ? null : asWorkspace(payload.workspace),
      };
    },

    async clearConversationWorkspace(conversationId) {
      const payload = await request(
        "PATCH",
        `/conversations/${encodeURIComponent(conversationId)}/workspace`,
        { workspaceId: null },
      );
      if (!isRecord(payload)) {
        throw new WorkspaceHttpError("gateway", "Respuesta de asociación inválida.", 500);
      }
      return {
        conversation: asConversation(payload.conversation),
        workspace: payload.workspace === null ? null : asWorkspace(payload.workspace),
      };
    },
  };
}
