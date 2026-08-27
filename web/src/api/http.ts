import type { ConnectionConfig, ConversationMeta, HealthSnapshot } from "../types";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export function resolveHttpBase(cfg: ConnectionConfig): string {
  if (cfg.httpBase.trim()) return cfg.httpBase.replace(/\/$/, "");
  return "";
}

export async function fetchHealth(base: string): Promise<HealthSnapshot> {
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`health_${res.status}`);
  const json = (await res.json()) as HealthSnapshot;
  return {
    ok: Boolean(json.ok),
    name: json.name,
    devices: Array.isArray(json.devices) ? json.devices : [],
    agentReady: Boolean(json.agentReady),
    agentTools: Array.isArray(json.agentTools) ? json.agentTools : [],
  };
}

export async function listConversations(
  base: string,
  token: string,
): Promise<ConversationMeta[]> {
  // Prefer listing via workspaces: fetch all workspaces then conversations.
  // Also support orphan conversations by creating via POST when needed.
  const wsRes = await fetch(`${base}/workspaces`, {
    headers: authHeaders(token),
  });
  if (!wsRes.ok) throw new Error(`workspaces_${wsRes.status}`);
  const wsJson = (await wsRes.json()) as {
    workspaces: Array<{ id: string }>;
  };
  const all: ConversationMeta[] = [];
  for (const w of wsJson.workspaces ?? []) {
    const cRes = await fetch(`${base}/workspaces/${w.id}/conversations`, {
      headers: authHeaders(token),
    });
    if (!cRes.ok) continue;
    const list = (await cRes.json()) as ConversationMeta[];
    all.push(...list);
  }
  // Deduplicate by id
  const map = new Map(all.map((c) => [c.id, c]));
  return [...map.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function createConversation(
  base: string,
  token: string,
  title?: string,
): Promise<ConversationMeta> {
  const res = await fetch(`${base}/conversations`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: title || null }),
  });
  if (!res.ok) throw new Error(`create_conversation_${res.status}`);
  return (await res.json()) as ConversationMeta;
}

export async function fetchMessages(
  base: string,
  token: string,
  conversationId: string,
): Promise<Array<{ id: string; role: string; content: string }>> {
  const res = await fetch(`${base}/conversations/${conversationId}/messages`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`messages_${res.status}`);
  return (await res.json()) as Array<{
    id: string;
    role: string;
    content: string;
  }>;
}

export type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
};

export async function listWorkspaces(
  base: string,
  token: string,
): Promise<WorkspaceRow[]> {
  const res = await fetch(`${base}/workspaces`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`workspaces_${res.status}`);
  const json = (await res.json()) as { workspaces: WorkspaceRow[] };
  return Array.isArray(json.workspaces) ? json.workspaces : [];
}
