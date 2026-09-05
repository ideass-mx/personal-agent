import type { SetupStatusDto } from "../types";

export type SetupProviderDto = {
  id: string;
  name: string;
  available: boolean;
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

export async function fetchSetupStatus(
  base: string,
  token: string,
): Promise<SetupStatusDto> {
  const res = await fetch(`${base}/v1/setup/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`setup_status_${res.status}`);
  return (await res.json()) as SetupStatusDto;
}

export async function fetchSetupProviders(
  base: string,
  token: string,
): Promise<SetupProviderDto[]> {
  const res = await fetch(`${base}/v1/setup/providers`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`setup_providers_${res.status}`);
  const json = (await res.json()) as {
    ok?: boolean;
    providers?: SetupProviderDto[];
  };
  return Array.isArray(json.providers) ? json.providers : [];
}

export async function transitionSetup(
  base: string,
  token: string,
  state: string,
  extra?: { llmProvider?: string },
): Promise<SetupStatusDto> {
  const res = await fetch(`${base}/v1/setup/transition`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ state, ...extra }),
  });
  if (!res.ok) throw new Error(`setup_transition_${res.status}`);
  return (await res.json()) as SetupStatusDto;
}

export async function configureSetupLlm(
  base: string,
  token: string,
  opts: { provider: string; credential: string },
): Promise<SetupStatusDto> {
  const res = await fetch(`${base}/v1/setup/llm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      provider: opts.provider,
      credential: opts.credential,
      apiKey: opts.credential,
    }),
  });
  const json = (await res.json()) as SetupStatusDto & {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `setup_llm_${res.status}`);
  }
  return json;
}

export async function verifySetup(
  base: string,
  token: string,
): Promise<SetupStatusDto & { checks?: Record<string, boolean> }> {
  const res = await fetch(`${base}/v1/setup/verify`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const json = (await res.json()) as SetupStatusDto & {
    error?: { code: string; message: string };
    checks?: Record<string, boolean>;
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `setup_verify_${res.status}`);
  }
  return json;
}

export type PairingCreateResponse = {
  ok: true;
  pairingSessionId: string;
  qrDataUrl?: string;
  uri?: string;
  expiresAt?: string;
};

export async function createPairingSession(
  base: string,
  token: string,
): Promise<PairingCreateResponse> {
  const res = await fetch(`${base}/v1/pairing/sessions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  const json = (await res.json()) as PairingCreateResponse & {
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error("No pudimos preparar el emparejamiento del teléfono.");
  }
  return json;
}
