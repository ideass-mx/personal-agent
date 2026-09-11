/**
 * Cliente HTTP — memoria personal + agent rules.
 */
function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export type AgentRuleRow = {
  id: string;
  userId: string;
  content: string;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listAgentRules(
  base: string,
  token: string,
): Promise<AgentRuleRow[]> {
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/agent-rules`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`agent_rules_${res.status}`);
  const json = (await res.json()) as { rules?: AgentRuleRow[] };
  return Array.isArray(json.rules) ? json.rules : [];
}

export async function createAgentRule(
  base: string,
  token: string,
  content: string,
): Promise<AgentRuleRow> {
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/agent-rules`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`agent_rules_create_${res.status}`);
  const json = (await res.json()) as { rule: AgentRuleRow };
  return json.rule;
}

export async function deleteAgentRule(
  base: string,
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(
    `${base.replace(/\/$/, "")}/v1/agent-rules/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  if (!res.ok) throw new Error(`agent_rules_delete_${res.status}`);
}
