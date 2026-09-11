/**
 * HTTP — Memoria personal + Agent Rules (Settings).
 * Distinto de TurnMemory / conversations.
 */
import type { Context, Hono } from "hono";
import { LOCAL_USER_ID } from "../identity/types.ts";
import {
  createAgentRule,
  deleteAgentRule,
  listAgentRules,
  updateAgentRule,
} from "../agent-rules/index.ts";
import {
  MEMORY_CATEGORIES,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  buildMemoryContextBlock,
  createUserMemory,
  forgetUserMemory,
  getUserMemoryById,
  listUserMemories,
  processMemoryCandidates,
  updateUserMemory,
  type MemoryCandidate,
  type MemoryCategory,
  type MemoryScope,
  type MemoryType,
} from "../user-memory/index.ts";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireAgentOwner } from "./owner-auth.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asCategory(v: unknown): MemoryCategory | null {
  return typeof v === "string" &&
    (MEMORY_CATEGORIES as readonly string[]).includes(v)
    ? (v as MemoryCategory)
    : null;
}

function asType(v: unknown): MemoryType | null {
  return typeof v === "string" && (MEMORY_TYPES as readonly string[]).includes(v)
    ? (v as MemoryType)
    : null;
}

function asScope(v: unknown): MemoryScope | null {
  return typeof v === "string" &&
    (MEMORY_SCOPES as readonly string[]).includes(v)
    ? (v as MemoryScope)
    : null;
}

function serializeMemory(m: ReturnType<typeof getUserMemoryById>) {
  if (!m) return null;
  return {
    id: m.id,
    userId: m.userId,
    category: m.category,
    type: m.type,
    scope: m.scope,
    content: m.content,
    importance: m.importance,
    confidence: m.confidence,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    sourceReason: m.sourceReason,
    status: m.status,
    projectId: m.projectId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    lastAccessedAt: m.lastAccessedAt,
    expiresAt: m.expiresAt,
    supersededBy: m.supersededBy,
  };
}

export function mountUserMemoryHttp(
  app: Hono,
  deps: { hubToken: string },
): void {
  const gate = (c: Context) => requireAgentOwner(c, deps.hubToken);

  app.get("/v1/memory", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const category = asCategory(c.req.query("category"));
    const scope = asScope(c.req.query("scope"));
    const q = c.req.query("q") ?? undefined;
    const projectId = c.req.query("projectId");
    const memories = listUserMemories({
      userId: LOCAL_USER_ID,
      status: "ACTIVE",
      ...(category ? { category } : {}),
      ...(scope ? { scope } : {}),
      ...(q ? { query: q } : {}),
      ...(projectId !== undefined
        ? { projectId: projectId || null }
        : {}),
    });
    return c.json({
      ok: true,
      memories: memories.map((m) => serializeMemory(m)),
      categories: MEMORY_CATEGORIES,
    });
  });

  app.get("/v1/memory/context", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const q = c.req.query("q") ?? "";
    const projectId = c.req.query("projectId") || null;
    const block = buildMemoryContextBlock({
      userId: LOCAL_USER_ID,
      query: q,
      projectId,
      preferProject: Boolean(projectId),
    });
    return c.json({ ok: true, context: block });
  });

  /** Candidatos propuestos (p. ej. por el LLM) — el subsystem decide. */
  app.post("/v1/memory/candidates", async (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isRecord(body) || !Array.isArray(body.candidates)) {
      return c.json(
        httpErrorBody("bad_request", "Se requiere candidates (array)."),
        400,
      );
    }
    const candidates: MemoryCandidate[] = [];
    for (const raw of body.candidates) {
      if (!isRecord(raw) || typeof raw.content !== "string") continue;
      candidates.push({
        content: raw.content,
        category: asCategory(raw.category) ?? undefined,
        type: asType(raw.type) ?? undefined,
        scope: asScope(raw.scope) ?? undefined,
        projectId: typeof raw.projectId === "string" ? raw.projectId : null,
        fromProjectKnowledge: raw.fromProjectKnowledge === true,
        sourceType:
          typeof raw.sourceType === "string" ? raw.sourceType : "inferred",
        sourceId: typeof raw.sourceId === "string" ? raw.sourceId : undefined,
        sourceReason:
          typeof raw.sourceReason === "string" ? raw.sourceReason : undefined,
        confidence:
          typeof raw.confidence === "number" ? raw.confidence : undefined,
        importance:
          typeof raw.importance === "number" ? raw.importance : undefined,
      });
    }
    const results = processMemoryCandidates(LOCAL_USER_ID, candidates);
    return c.json({
      ok: true,
      results: results.map((r) => ({
        outcome: r.outcome,
        reason: r.reason,
        applied: r.applied,
        memory: r.memory ? serializeMemory(r.memory) : undefined,
        agentRuleId: r.agentRuleId,
      })),
    });
  });

  app.get("/v1/memory/:id", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const m = getUserMemoryById(c.req.param("id"));
    if (!m || m.userId !== LOCAL_USER_ID || m.status === "DELETED") {
      return c.json(httpErrorBody("not_found", "Memoria no encontrada."), 404);
    }
    return c.json({ ok: true, memory: serializeMemory(m) });
  });

  app.post("/v1/memory", async (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isRecord(body) || typeof body.content !== "string") {
      return c.json(
        httpErrorBody("bad_request", "Se requiere content (string)."),
        400,
      );
    }
    // Manual add → pipeline (puede ir a Agent Rules)
    const results = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: body.content,
        category: asCategory(body.category) ?? undefined,
        type: asType(body.type) ?? "EXPLICIT",
        scope: asScope(body.scope) ?? "GLOBAL",
        projectId:
          typeof body.projectId === "string" ? body.projectId : null,
        sourceType: "user_manual",
        sourceReason:
          typeof body.sourceReason === "string"
            ? body.sourceReason
            : "Lo añadiste tú manualmente.",
        confidence: 0.9,
        importance:
          typeof body.importance === "number" ? body.importance : 0.7,
      },
    ]);
    const result = results[0]!;
    if (result.outcome === "ROUTE_TO_AGENT_RULE") {
      return c.json(
        {
          ok: true,
          routed: "agent_rule",
          agentRuleId: result.agentRuleId,
          reason: result.reason,
        },
        201,
      );
    }
    if (!result.applied || !result.memory) {
      // Forzar CREATE en IMPORTANT si el usuario insiste manualmente y fue IGNORE unknown
      if (result.outcome === "IGNORE") {
        try {
          const memory = createUserMemory({
            userId: LOCAL_USER_ID,
            content: body.content.trim(),
            category: asCategory(body.category) ?? "IMPORTANT_INFORMATION",
            type: "EXPLICIT",
            scope: asScope(body.scope) ?? "GLOBAL",
            sourceType: "user_manual",
            sourceReason: "Lo añadiste tú manualmente.",
            confidence: 0.9,
            importance: 0.7,
            projectId:
              typeof body.projectId === "string" ? body.projectId : null,
          });
          return c.json({ ok: true, memory: serializeMemory(memory) }, 201);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "bad_request";
          return c.json(httpErrorBody(msg, "No se pudo guardar la memoria."), 400);
        }
      }
      return c.json(
        { ok: false, outcome: result.outcome, reason: result.reason },
        422,
      );
    }
    return c.json({ ok: true, memory: serializeMemory(result.memory) }, 201);
  });

  app.patch("/v1/memory/:id", async (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const existing = getUserMemoryById(c.req.param("id"));
    if (!existing || existing.userId !== LOCAL_USER_ID) {
      return c.json(httpErrorBody("not_found", "Memoria no encontrada."), 404);
    }
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return c.json(httpErrorBody("bad_request", "JSON inválido."), 400);
    }
    try {
      const memory = updateUserMemory(existing.id, {
        content: typeof body.content === "string" ? body.content : undefined,
        category: asCategory(body.category) ?? undefined,
        type: asType(body.type) ?? undefined,
        scope: asScope(body.scope) ?? undefined,
        importance:
          typeof body.importance === "number" ? body.importance : undefined,
        confidence:
          typeof body.confidence === "number" ? body.confidence : undefined,
        sourceReason:
          typeof body.sourceReason === "string" ? body.sourceReason : undefined,
      });
      return c.json({ ok: true, memory: serializeMemory(memory) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "bad_request";
      return c.json(httpErrorBody(msg, "No se pudo actualizar."), 400);
    }
  });

  app.delete("/v1/memory/:id", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const existing = getUserMemoryById(c.req.param("id"));
    if (!existing || existing.userId !== LOCAL_USER_ID) {
      return c.json(httpErrorBody("not_found", "Memoria no encontrada."), 404);
    }
    const memory = forgetUserMemory(existing.id);
    return c.json({ ok: true, memory: serializeMemory(memory) });
  });

  // —— Agent Rules (Settings) ——
  app.get("/v1/agent-rules", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    return c.json({ ok: true, rules: listAgentRules(LOCAL_USER_ID) });
  });

  app.post("/v1/agent-rules", async (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isRecord(body) || typeof body.content !== "string") {
      return c.json(
        httpErrorBody("bad_request", "Se requiere content (string)."),
        400,
      );
    }
    try {
      const rule = createAgentRule({
        userId: LOCAL_USER_ID,
        content: body.content,
        sourceType: "user_manual",
      });
      return c.json({ ok: true, rule }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "bad_request";
      return c.json(httpErrorBody(msg, "No se pudo crear la regla."), 400);
    }
  });

  app.patch("/v1/agent-rules/:id", async (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return c.json(httpErrorBody("bad_request", "JSON inválido."), 400);
    }
    try {
      const rule = updateAgentRule(c.req.param("id"), {
        content: typeof body.content === "string" ? body.content : undefined,
      });
      return c.json({ ok: true, rule });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "bad_request";
      const status = msg === "agent_rule_not_found" ? 404 : 400;
      return c.json(httpErrorBody(msg, "No se pudo actualizar."), status);
    }
  });

  app.delete("/v1/agent-rules/:id", (c) => {
    const gated = gate(c);
    if (gated instanceof Response) return gated;
    try {
      const rule = deleteAgentRule(c.req.param("id"));
      return c.json({ ok: true, rule });
    } catch {
      return c.json(httpErrorBody("not_found", "Regla no encontrada."), 404);
    }
  });
}
