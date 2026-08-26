import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createWorkspaceHttpClient,
  WorkspaceHttpError,
} from "../src/index.ts";
import type { ConversationRecord, Workspace } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const sampleWs = (id: string, name: string): Workspace => ({
  id,
  name,
  description: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const sampleConv = (
  id: string,
  workspaceId: string | null,
): ConversationRecord => ({
  id,
  title: null,
  createdAt: "2026-01-01T00:00:00Z",
  workspaceId,
});

type Recorded = {
  method: string;
  url: string;
  authorization: string | null;
  body: unknown;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("WorkspaceHttpClient", () => {
  it("list/create/get/update/delete Workspace con Bearer", async () => {
    const calls: Recorded[] = [];
    const w = sampleWs("w_1", "Libro");
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        url,
        authorization: headers.get("Authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (method === "GET" && url.endsWith("/workspaces")) {
        return jsonResponse(200, { workspaces: [w] });
      }
      if (method === "POST" && url.endsWith("/workspaces")) {
        return jsonResponse(201, { ...w, name: "Libro" });
      }
      if (method === "GET" && url.endsWith("/workspaces/w_1")) {
        return jsonResponse(200, w);
      }
      if (method === "PATCH" && url.endsWith("/workspaces/w_1")) {
        return jsonResponse(200, { ...w, name: "Libro v2" });
      }
      if (method === "DELETE" && url.endsWith("/workspaces/w_1")) {
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(500, { error: { code: "internal", message: "no" } });
    };
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "secret",
      fetch: fetchMock,
    });
    const listed = await client.listWorkspaces();
    assert.equal(listed[0]?.id, "w_1");
    const created = await client.createWorkspace({ name: "Libro" });
    assert.equal(created.name, "Libro");
    const got = await client.getWorkspace("w_1");
    assert.equal(got.id, "w_1");
    const updated = await client.updateWorkspace("w_1", { name: "Libro v2" });
    assert.equal(updated.name, "Libro v2");
    await client.deleteWorkspace("w_1");
    assert.equal(calls.length, 5);
    for (const call of calls) {
      assert.equal(call.authorization, "Bearer secret");
      assert.equal(call.url.startsWith("http://gw/"), true);
      assert.doesNotMatch(call.url, /deviceId/);
    }
  });

  it("asocia, cambia, limpia; casual = null; conversationId se preserva", async () => {
    const wx = sampleWs("w_x", "X");
    const wy = sampleWs("w_y", "Y");
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (method === "GET" && url.endsWith("/conversations/c_1/workspace")) {
        return jsonResponse(200, { conversationId: "c_1", workspace: null });
      }
      if (method === "PATCH" && url.endsWith("/conversations/c_1/workspace")) {
        if (body.workspaceId === "w_x") {
          return jsonResponse(200, {
            conversation: sampleConv("c_1", "w_x"),
            workspace: wx,
          });
        }
        if (body.workspaceId === "w_y") {
          return jsonResponse(200, {
            conversation: sampleConv("c_1", "w_y"),
            workspace: wy,
          });
        }
        if (body.workspaceId === null) {
          return jsonResponse(200, {
            conversation: sampleConv("c_1", null),
            workspace: null,
          });
        }
      }
      if (method === "GET" && url.endsWith("/conversations/c_1")) {
        return jsonResponse(200, sampleConv("c_1", null));
      }
      return jsonResponse(500, {});
    };
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw/",
      token: "t",
      fetch: fetchMock,
    });
    const casual = await client.getConversationWorkspace("c_1");
    assert.equal(casual, null);
    const conv = await client.getConversation("c_1");
    assert.equal(conv.id, "c_1");
    assert.equal(conv.workspaceId, null);
    const a = await client.setConversationWorkspace("c_1", "w_x");
    assert.equal(a.conversation.id, "c_1");
    assert.equal(a.workspace?.id, "w_x");
    const b = await client.setConversationWorkspace("c_1", "w_y");
    assert.equal(b.workspace?.id, "w_y");
    const c = await client.clearConversationWorkspace("c_1");
    assert.equal(c.workspace, null);
    assert.equal(c.conversation.workspaceId, null);
    assert.equal(c.conversation.id, "c_1");
  });

  it("404 no se convierte en null; 401; payload 400", async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") !== "Bearer good") {
        return jsonResponse(401, {
          error: { code: "unauthorized", message: "Token inválido o ausente." },
        });
      }
      if (url.includes("w_missing")) {
        return jsonResponse(404, {
          error: { code: "not_found", message: "Workspace inexistente." },
        });
      }
      if (method === "POST") {
        return jsonResponse(400, {
          error: { code: "bad_request", message: "Se requiere name (string)." },
        });
      }
      return jsonResponse(200, { workspaces: [] });
    };
    const denied = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "bad",
      fetch: fetchMock,
    });
    await assert.rejects(
      () => denied.listWorkspaces(),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "unauthorized");
        assert.equal(err.status, 401);
        return true;
      },
    );
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "good",
      fetch: fetchMock,
    });
    await assert.rejects(
      () => client.getWorkspace("w_missing"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "not_found");
        assert.equal(err.status, 404);
        return true;
      },
    );
    await assert.rejects(
      () => client.createWorkspace({ name: "" }),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "bad_request");
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it("409 inconsistente; 403; 5xx", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("c_orphan")) {
        return jsonResponse(409, {
          error: { code: "inconsistent", message: "Workspace inconsistente" },
        });
      }
      if (url.includes("forbidden")) {
        return jsonResponse(403, {
          error: { code: "unauthorized", message: "no" },
        });
      }
      return jsonResponse(503, {
        error: { code: "internal", message: "caído" },
      });
    };
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "t",
      fetch: fetchMock,
    });
    await assert.rejects(
      () => client.getConversationWorkspace("c_orphan"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "conflict");
        assert.equal(err.status, 409);
        return true;
      },
    );
    await assert.rejects(
      () => client.getWorkspace("forbidden"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "unauthorized");
        assert.equal(err.status, 403);
        return true;
      },
    );
    await assert.rejects(
      () => client.listWorkspaces(),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "gateway");
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it("POST /conversations crea casual o con Workspace", async () => {
    const calls: Recorded[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        url,
        authorization: headers.get("Authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (method === "POST" && url.endsWith("/conversations")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return jsonResponse(201, sampleConv("c_new", body.workspaceId ?? null));
      }
      return jsonResponse(500, {});
    };
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "secret",
      fetch: fetchMock,
    });
    const casual = await client.createConversation({ workspaceId: null });
    assert.equal(casual.workspaceId, null);
    const inWs = await client.createConversation({ workspaceId: "w_x" });
    assert.equal(inWs.workspaceId, "w_x");
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url.endsWith("/conversations"), true);
    assert.equal((calls[0]?.body as { workspaceId: null }).workspaceId, null);
    assert.doesNotMatch(calls[0]?.url ?? "", /user_message/);
  });

  it("listWorkspaceConversations: array, 404, auth", async () => {
    const conv = sampleConv("c_1", "w_x");
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") !== "Bearer secret") {
        return jsonResponse(401, {
          error: { code: "unauthorized", message: "Token inválido o ausente." },
        });
      }
      if (url.endsWith("/workspaces/w_missing/conversations")) {
        return jsonResponse(404, {
          error: { code: "not_found", message: "Workspace inexistente." },
        });
      }
      if (url.endsWith("/workspaces/w_x/conversations")) {
        return jsonResponse(200, [conv]);
      }
      return jsonResponse(500, {});
    };
    const denied = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "bad",
      fetch: fetchMock,
    });
    await assert.rejects(
      () => denied.listWorkspaceConversations("w_x"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "unauthorized");
        return true;
      },
    );
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "secret",
      fetch: fetchMock,
    });
    const listed = await client.listWorkspaceConversations("w_x");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c_1");
    await assert.rejects(
      () => client.listWorkspaceConversations("w_missing"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceHttpError);
        assert.equal(err.kind, "not_found");
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it("GET conversation messages con Bearer", async () => {
    const sample = {
      id: "m_1",
      conversationId: "c_1",
      role: "user" as const,
      content: "hola",
      deviceId: "d_1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/conversations/c_1/messages")) {
        return jsonResponse(200, [sample]);
      }
      return jsonResponse(404, { error: { code: "not_found", message: "no" } });
    };
    const client = createWorkspaceHttpClient({
      baseUrl: "http://gw",
      token: "secret",
      fetch: fetchMock,
    });
    const messages = await client.getConversationMessages("c_1");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.id, "m_1");
    assert.equal(messages[0]?.content, "hola");
  });

  it("no envía user_message ni workspaceId por WS", () => {
    const src = readFileSync(path.join(here, "../src/client.ts"), "utf8");
    assert.doesNotMatch(src, /user_message/);
    assert.doesNotMatch(src, /getActiveWorkspace|setActiveWorkspace/);
    assert.doesNotMatch(src, /createAgentRuntime|runTurn/);
    const proto = readFileSync(
      path.join(here, "../../protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);
    assert.match(proto, /conversationId/);
  });
});
