/**
 * API HTTP de Workspace (Gateway). No es el protocolo WS.
 * El Agent Runtime no importa este módulo.
 * PHASE 57.7: auth via authenticateHttpRequest (install_compat local-only).
 */
import type { Context, Hono } from "hono";
import {
  createConversation,
  getConversation,
  listConversationsByWorkspace,
  setConversationWorkspace,
} from "../memory/conversation-workspace.ts";
import { listConversationMessages } from "../memory/history.ts";
import { resolveWorkspaceForConversation } from "../memory/resolve-workspace-for-conversation.ts";
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";
import type { WorkspaceStore } from "../workspace/types.ts";
import {
  authenticateHttpRequest,
  httpErrorBody,
} from "./bearer-auth.ts";
import { assertAgentOwner } from "../identity/owner.ts";

export type WorkspaceHttpDeps = {
  workspaces: WorkspaceStore;
  hubToken: string;
  sql?: WorkspaceSqlDb;
};

function errorBody(code: string, message: string): { error: { code: string; message: string } } {
  return httpErrorBody(code, message);
}

function requireAuth(c: Context, hubToken: string): Response | undefined {
  const principal = authenticateHttpRequest(c, hubToken);
  if (!principal) {
    return c.json(errorBody("unauthorized", "Token inválido o ausente."), 401);
  }
  const ownership = assertAgentOwner(principal.userContext);
  if (!ownership.ok) {
    return c.json(errorBody(ownership.code, ownership.message), 403);
  }
  return undefined;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw Object.assign(new Error("JSON inválido."), { httpStatus: 400 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mountWorkspaceHttp(app: Hono, deps: WorkspaceHttpDeps): void {
  const { workspaces, hubToken, sql } = deps;

  app.get("/workspaces", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    return c.json({ workspaces: workspaces.listWorkspaces() });
  });

  app.post("/workspaces", async (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    let body: unknown;
    try {
      body = await readJson(c);
    } catch {
      return c.json(errorBody("bad_request", "JSON inválido."), 400);
    }
    if (!isRecord(body) || typeof body.name !== "string") {
      return c.json(errorBody("bad_request", "Se requiere name (string)."), 400);
    }
    const description =
      body.description === undefined
        ? undefined
        : body.description === null
          ? null
          : typeof body.description === "string"
            ? body.description
            : undefined;
    if (body.description !== undefined && description === undefined) {
      return c.json(errorBody("bad_request", "description debe ser string o null."), 400);
    }
    try {
      const created = workspaces.createWorkspace({
        name: body.name,
        description,
      });
      return c.json(created, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error creando Workspace.";
      return c.json(errorBody("bad_request", message), 400);
    }
  });

  app.get("/workspaces/:id", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const found = workspaces.getWorkspace(c.req.param("id"));
    if (!found) {
      return c.json(errorBody("not_found", "Workspace inexistente."), 404);
    }
    return c.json(found);
  });

  app.patch("/workspaces/:id", async (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    let body: unknown;
    try {
      body = await readJson(c);
    } catch {
      return c.json(errorBody("bad_request", "JSON inválido."), 400);
    }
    if (!isRecord(body)) {
      return c.json(errorBody("bad_request", "JSON inválido."), 400);
    }
    const patch: { name?: string; description?: string | null } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return c.json(errorBody("bad_request", "name debe ser string."), 400);
      }
      patch.name = body.name;
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return c.json(errorBody("bad_request", "description debe ser string o null."), 400);
      }
      patch.description = body.description;
    }
    try {
      const updated = workspaces.updateWorkspace(c.req.param("id"), patch);
      if (!updated) {
        return c.json(errorBody("not_found", "Workspace inexistente."), 404);
      }
      return c.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error actualizando Workspace.";
      return c.json(errorBody("bad_request", message), 400);
    }
  });

  app.delete("/workspaces/:id", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const deleted = workspaces.deleteWorkspace(c.req.param("id"));
    if (!deleted) {
      return c.json(errorBody("not_found", "Workspace inexistente."), 404);
    }
    return c.json({ ok: true });
  });

  app.get("/workspaces/:id/conversations", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const workspaceId = c.req.param("id");
    if (!workspaces.getWorkspace(workspaceId)) {
      return c.json(errorBody("not_found", "Workspace inexistente."), 404);
    }
    const conversations = sql
      ? listConversationsByWorkspace(workspaceId, sql)
      : listConversationsByWorkspace(workspaceId);
    return c.json(conversations);
  });

  app.post("/conversations", async (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    let body: unknown = {};
    const raw = await c.req.text();
    if (raw.trim().length > 0) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        return c.json(errorBody("bad_request", "JSON inválido."), 400);
      }
    }
    if (!isRecord(body)) {
      return c.json(errorBody("bad_request", "JSON inválido."), 400);
    }
    let workspaceId: string | null | undefined;
    if (!("workspaceId" in body) || body.workspaceId === undefined) {
      workspaceId = undefined;
    } else if (body.workspaceId === null) {
      workspaceId = null;
    } else if (typeof body.workspaceId === "string") {
      workspaceId = body.workspaceId;
    } else {
      return c.json(
        errorBody("bad_request", "workspaceId debe ser string o null."),
        400,
      );
    }
    let title: string | null | undefined;
    if (!("title" in body) || body.title === undefined) {
      title = undefined;
    } else if (body.title === null) {
      title = null;
    } else if (typeof body.title === "string") {
      title = body.title;
    } else {
      return c.json(errorBody("bad_request", "title debe ser string o null."), 400);
    }
    try {
      const created = sql
        ? createConversation({ workspaceId, title }, sql)
        : createConversation({ workspaceId, title });
      return c.json(created, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error creando Conversation.";
      if (message.startsWith("Workspace inexistente")) {
        return c.json(errorBody("not_found", message), 404);
      }
      return c.json(errorBody("bad_request", message), 400);
    }
  });

  app.get("/conversations/:id", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const found = getConversation(c.req.param("id"), sql);
    if (!found) {
      return c.json(errorBody("not_found", "Conversation inexistente."), 404);
    }
    return c.json(found);
  });

  app.get("/conversations/:id/messages", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const conversationId = c.req.param("id");
    const found = getConversation(conversationId, sql);
    if (!found) {
      return c.json(errorBody("not_found", "Conversation inexistente."), 404);
    }
    const messages = sql
      ? listConversationMessages(conversationId, sql)
      : listConversationMessages(conversationId);
    return c.json(messages);
  });

  app.get("/conversations/:id/workspace", (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const conversationId = c.req.param("id");
    try {
      const workspace = resolveWorkspaceForConversation(
        conversationId,
        workspaces,
        sql,
      );
      return c.json({ conversationId, workspace });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error resolviendo Workspace.";
      if (message.startsWith("Conversation inexistente")) {
        return c.json(errorBody("not_found", message), 404);
      }
      if (message.startsWith("Workspace inconsistente")) {
        return c.json(errorBody("inconsistent", message), 409);
      }
      return c.json(errorBody("bad_request", message), 400);
    }
  });

  app.patch("/conversations/:id/workspace", async (c) => {
    const denied = requireAuth(c, hubToken);
    if (denied) return denied;
    const conversationId = c.req.param("id");
    let body: unknown;
    try {
      body = await readJson(c);
    } catch {
      return c.json(errorBody("bad_request", "JSON inválido."), 400);
    }
    if (!isRecord(body) || !("workspaceId" in body)) {
      return c.json(
        errorBody("bad_request", "Se requiere workspaceId (string o null)."),
        400,
      );
    }
    const workspaceId = body.workspaceId;
    if (workspaceId !== null && typeof workspaceId !== "string") {
      return c.json(
        errorBody("bad_request", "workspaceId debe ser string o null."),
        400,
      );
    }
    try {
      const conversation = setConversationWorkspace(
        conversationId,
        workspaceId,
        sql,
      );
      const workspace =
        conversation.workspaceId === null
          ? null
          : resolveWorkspaceForConversation(conversationId, workspaces, sql);
      return c.json({ conversation, workspace });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error asociando Workspace.";
      if (message.startsWith("Conversation inexistente")) {
        return c.json(errorBody("not_found", message), 404);
      }
      if (message.startsWith("Workspace inexistente")) {
        return c.json(errorBody("not_found", message), 404);
      }
      return c.json(errorBody("bad_request", message), 400);
    }
  });
}
