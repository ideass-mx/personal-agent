import { resolveHttpBase } from "./http";
import type { ConnectionConfig } from "../types";

export type IdentityMeDto = {
  ok: true;
  user: {
    id: string;
    name: string;
    profileCompleted: boolean;
    createdAt: string;
  };
  agent: {
    id: string;
    name: string;
  };
};

function authHeaders(token: string): HeadersInit {
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (!token.trim()) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }
  return headers;
}

function identityFetchInit(token: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "same-origin",
    headers: {
      ...authHeaders(token),
      ...(init?.headers || {}),
    },
  };
}

export async function fetchIdentityMe(
  base: string,
  token: string,
): Promise<IdentityMeDto> {
  const res = await fetch(
    `${base}/v1/identity/me`,
    identityFetchInit(token),
  );
  if (!res.ok) throw new Error(`identity_me_${res.status}`);
  return (await res.json()) as IdentityMeDto;
}

export async function updateIdentityName(
  base: string,
  token: string,
  name: string,
): Promise<IdentityMeDto["user"]> {
  const res = await fetch(
    `${base}/v1/identity/me`,
    identityFetchInit(token, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message || `identity_patch_${res.status}`);
  }
  const json = (await res.json()) as { user: IdentityMeDto["user"] };
  return json.user;
}

export function resolveIdentityBase(session: ConnectionConfig): string {
  return resolveHttpBase(session);
}
