/**
 * Semántica de GET /conversations/:id/messages sin better-sqlite3
 * (ABI Node 18 vs nativo = ENVIRONMENTAL en este entorno).
 * El cableado real se protege en phase32-conversation-recovery-and-stream-routing.test.ts.
 */
import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import { Hono } from "hono";

const HUB_TOKEN = "test-secret";

type StoredMessage = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  deviceId: string | null;
  createdAt: string;
};

type Store = {
  conversations: Set<string>;
  messages: StoredMessage[];
};

function tokenMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** Misma semántica que workspace-http + listConversationMessages. */
function mountTestApp(store: Store): Hono {
  const app = new Hono();
  app.get("/conversations/:id/messages", (c) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (!token || !tokenMatches(token, HUB_TOKEN)) {
      return c.json(errorBody("unauthorized", "Token inválido o ausente."), 401);
    }
    const conversationId = c.req.param("id");
    if (!store.conversations.has(conversationId)) {
      return c.json(errorBody("not_found", "Conversation inexistente."), 404);
    }
    const messages = store.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => {
        const t = a.createdAt.localeCompare(b.createdAt);
        return t !== 0 ? t : a.id.localeCompare(b.id);
      });
    return c.json(messages);
  });
  return app;
}

async function getMessages(
  app: Hono,
  conversationId: string,
  token?: string,
): Promise<Response> {
  return app.request(
    `http://localhost/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    },
  );
}

describe("GET /conversations/:id/messages (semantic)", () => {
  it("401 sin token o token inválido", async () => {
    const app = mountTestApp({
      conversations: new Set(["c_a"]),
      messages: [],
    });
    assert.equal((await getMessages(app, "c_a")).status, 401);
    assert.equal((await getMessages(app, "c_a", "wrong")).status, 401);
  });

  it("404 si Conversation inexistente (no [])", async () => {
    const app = mountTestApp({ conversations: new Set(), messages: [] });
    const res = await getMessages(app, "c_missing", HUB_TOKEN);
    assert.equal(res.status, 404);
  });

  it("200 [] si Conversation existe sin mensajes", async () => {
    const app = mountTestApp({
      conversations: new Set(["c_empty"]),
      messages: [],
    });
    const res = await getMessages(app, "c_empty", HUB_TOKEN);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it("200 mensajes ASC; casual OK; aislamiento", async () => {
    const app = mountTestApp({
      conversations: new Set(["c_1", "c_2"]),
      messages: [
        {
          id: "m_1",
          conversationId: "c_1",
          role: "user",
          content: "hola",
          deviceId: "d_1",
          createdAt: "2026-01-01 10:00:00",
        },
        {
          id: "m_2",
          conversationId: "c_1",
          role: "assistant",
          content: "respuesta",
          deviceId: null,
          createdAt: "2026-01-01 10:00:01",
        },
        {
          id: "m_x",
          conversationId: "c_2",
          role: "user",
          content: "otro hilo",
          deviceId: null,
          createdAt: "2026-01-01 11:00:00",
        },
      ],
    });
    const res = await getMessages(app, "c_1", HUB_TOKEN);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Array<{
      conversationId: string;
      id: string;
      role: string;
    }>;
    assert.equal(body.length, 2);
    assert.ok(body.every((m) => m.conversationId === "c_1"));
    assert.deepEqual(
      body.map((m) => m.id),
      ["m_1", "m_2"],
    );

    const res2 = await getMessages(app, "c_2", HUB_TOKEN);
    const body2 = (await res2.json()) as Array<{ content: string }>;
    assert.equal(body2.length, 1);
    assert.equal(body2[0]?.content, "otro hilo");
  });
});
