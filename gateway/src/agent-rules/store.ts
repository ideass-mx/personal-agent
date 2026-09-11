/**
 * Agent Rules — Settings / Agent Behavior / Rules.
 * No son memorias: definen cómo debe comportarse el agente.
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/database.ts";

export type AgentRuleStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

export type AgentRule = {
  readonly id: string;
  readonly userId: string;
  readonly content: string;
  readonly status: AgentRuleStatus;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  content: string;
  status: string;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): AgentRule {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    status: row.status as AgentRuleStatus,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAgentRule(input: {
  userId: string;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
}): AgentRule {
  const content = input.content.trim();
  if (!content) throw new Error("agent_rule_blank");
  // Dedup exacto activo
  const existing = db
    .prepare(
      `SELECT * FROM agent_rules
       WHERE user_id = ? AND status = 'ACTIVE' AND lower(content) = lower(?)`,
    )
    .get(input.userId, content) as Row | undefined;
  if (existing) return mapRow(existing);

  const id = `rule_${randomUUID()}`;
  db.prepare(
    `INSERT INTO agent_rules (id, user_id, content, source_type, source_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    content,
    input.sourceType ?? null,
    input.sourceId ?? null,
  );
  const row = db
    .prepare(`SELECT * FROM agent_rules WHERE id = ?`)
    .get(id) as Row;
  return mapRow(row);
}

export function listAgentRules(userId: string): AgentRule[] {
  const rows = db
    .prepare(
      `SELECT * FROM agent_rules
       WHERE user_id = ? AND status = 'ACTIVE'
       ORDER BY updated_at DESC`,
    )
    .all(userId) as Row[];
  return rows.map(mapRow);
}

export function getAgentRuleById(id: string): AgentRule | null {
  const row = db
    .prepare(`SELECT * FROM agent_rules WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function updateAgentRule(
  id: string,
  patch: { content?: string; status?: AgentRuleStatus },
): AgentRule {
  const current = getAgentRuleById(id);
  if (!current) throw new Error("agent_rule_not_found");
  const content =
    patch.content !== undefined ? patch.content.trim() : current.content;
  if (!content) throw new Error("agent_rule_blank");
  db.prepare(
    `UPDATE agent_rules
     SET content = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(content, patch.status ?? current.status, id);
  const updated = getAgentRuleById(id);
  if (!updated) throw new Error("agent_rule_not_found");
  return updated;
}

export function deleteAgentRule(id: string): AgentRule {
  return updateAgentRule(id, { status: "DELETED" });
}
