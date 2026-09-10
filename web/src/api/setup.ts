import type { SetupStatusDto } from "../types";

export type SetupProviderDto = {
  id: string;
  name: string;
  mode?: "local" | "personal-agent-cloud" | "external";
  available: boolean;
};

export type IntelligenceConnectionDto = {
  id: string;
  mode: "local" | "personal-agent-cloud" | "external";
  provider: string;
  modelId: string;
  displayName: string;
  baseUrl?: string;
  credentialConfigured?: boolean;
  credentialLabel?: string | null;
  configStatus?: "active" | "configured" | "not_configured";
  active?: boolean;
  modelSelection?: "recommended" | "specific";
  modelStatus?:
    | "available"
    | "unavailable"
    | "not_discovered"
    | "discovery_unsupported";
  recommendedModelId?: string | null;
  supportsModelDiscovery?: boolean;
};

export type ProviderModelDto = {
  id: string;
  name: string;
  recommended?: boolean;
  capabilities?: {
    chat?: boolean;
    vision?: boolean;
    tools?: boolean;
    structuredOutput?: boolean;
  };
  contextWindow?: number;
};

export type ProviderModelsDto = {
  ok?: boolean;
  provider: string;
  discoveryStatus: string;
  authStatus?: string;
  supportsModelDiscovery: boolean;
  recommendedModelId: string | null;
  modelStatus?: string | null;
  modelSelection?: string | null;
  modelId?: string | null;
  models: ProviderModelDto[];
  message?: string;
};

export type IntelligenceStatusDto = {
  ok?: boolean;
  active: IntelligenceConnectionDto | null;
  connections: IntelligenceConnectionDto[];
  local: {
    available: boolean;
    installed: boolean;
    warning: string | null;
    displayName: string;
  };
  cloud: { available: boolean };
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
): Promise<{
  providers: SetupProviderDto[];
  connections: IntelligenceConnectionDto[];
  selected: IntelligenceConnectionDto | null;
  local?: {
    available: boolean;
    installed: boolean;
    warning: string | null;
    displayName?: string;
  };
  cloud?: { available: boolean };
}> {
  const res = await fetch(`${base}/v1/setup/providers`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`setup_providers_${res.status}`);
  const json = (await res.json()) as {
    ok?: boolean;
    providers?: SetupProviderDto[];
    connections?: IntelligenceConnectionDto[];
    selected?: IntelligenceConnectionDto | null;
    local?: {
      available: boolean;
      installed: boolean;
      warning: string | null;
      displayName?: string;
    };
    cloud?: { available: boolean };
  };
  return {
    providers: Array.isArray(json.providers) ? json.providers : [],
    connections: Array.isArray(json.connections) ? json.connections : [],
    selected: json.selected || null,
    local: json.local,
    cloud: json.cloud,
  };
}

export async function fetchIntelligenceStatus(
  base: string,
  token: string,
): Promise<IntelligenceStatusDto> {
  const res = await fetch(`${base}/v1/setup/intelligence`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`intelligence_status_${res.status}`);
  return (await res.json()) as IntelligenceStatusDto;
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
  opts: {
    provider: string;
    credential?: string;
    modelId?: string;
    baseUrl?: string;
    modelSelection?: "recommended" | "specific";
  },
): Promise<SetupStatusDto & { discovery?: ProviderModelsDto }> {
  const res = await fetch(`${base}/v1/setup/llm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      provider: opts.provider,
      credential: opts.credential,
      apiKey: opts.credential,
      modelId: opts.modelId,
      baseUrl: opts.baseUrl,
      modelSelection: opts.modelSelection,
    }),
  });
  const json = (await res.json()) as SetupStatusDto & {
    error?: { code: string; message: string };
    discovery?: ProviderModelsDto;
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `setup_llm_${res.status}`);
  }
  return json;
}

export async function selectIntelligenceConnection(
  base: string,
  token: string,
  connectionId: string,
): Promise<SetupStatusDto> {
  const res = await fetch(`${base}/v1/setup/intelligence/select`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ connectionId }),
  });
  const json = (await res.json()) as SetupStatusDto & {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `setup_intelligence_${res.status}`);
  }
  return json;
}

export async function updateIntelligenceConnectionModel(
  base: string,
  token: string,
  connectionId: string,
  modelId: string,
): Promise<IntelligenceConnectionDto> {
  const res = await fetch(`${base}/v1/setup/intelligence/model`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ connectionId, modelId }),
  });
  const json = (await res.json()) as {
    connection?: IntelligenceConnectionDto;
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `setup_model_${res.status}`);
  }
  if (!json.connection) {
    throw new Error("setup_model_empty");
  }
  return json.connection;
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

export type CloudAuthStatusDto = {
  ok?: boolean;
  connected: boolean;
  deviceLabel: string;
  sessionActive: boolean;
  usingDevToken?: boolean;
  expiresAt?: string | null;
  errorCode?: string | null;
  lifecycle?: string;
};

export async function fetchCloudAuthStatus(
  base: string,
  token: string,
): Promise<CloudAuthStatusDto> {
  const res = await fetch(`${base}/v1/setup/cloud/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`cloud_status_${res.status}`);
  return (await res.json()) as CloudAuthStatusDto;
}

export async function disconnectCloudAuth(
  base: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${base}/v1/setup/cloud/disconnect`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(json.error?.message || `cloud_disconnect_${res.status}`);
  }
}

export async function connectCloudAuth(
  base: string,
  token: string,
): Promise<CloudAuthStatusDto> {
  const res = await fetch(`${base}/v1/setup/cloud/connect`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const json = (await res.json()) as CloudAuthStatusDto & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `cloud_connect_${res.status}`);
  }
  return json;
}

export async function disconnectProvider(
  base: string,
  token: string,
  providerId: string,
): Promise<IntelligenceStatusDto> {
  const res = await fetch(
    `${base}/v1/setup/providers/${encodeURIComponent(providerId)}/disconnect`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: "{}",
    },
  );
  const json = (await res.json()) as {
    ok?: boolean;
    intelligence?: IntelligenceStatusDto;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `provider_disconnect_${res.status}`);
  }
  return (
    json.intelligence ||
    (await fetchIntelligenceStatus(base, token))
  );
}

export async function testProviderConnection(
  base: string,
  token: string,
  providerId: string,
): Promise<{
  ok: true;
  message: string;
  discovery?: {
    status: string;
    modelStatus?: string;
    recommendedModelId?: string | null;
    models?: ProviderModelDto[];
  };
}> {
  const res = await fetch(
    `${base}/v1/setup/providers/${encodeURIComponent(providerId)}/test`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: "{}",
    },
  );
  const json = (await res.json()) as {
    ok?: boolean;
    message?: string;
    connectivity?: {
      discovery?: {
        status: string;
        modelStatus?: string;
        recommendedModelId?: string | null;
        models?: ProviderModelDto[];
      };
    };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `provider_test_${res.status}`);
  }
  return {
    ok: true,
    message: json.message || "La conexión funciona.",
    discovery: json.connectivity?.discovery,
  };
}

export async function fetchProviderModels(
  base: string,
  token: string,
  providerId: string,
  opts?: { refresh?: boolean },
): Promise<ProviderModelsDto> {
  const q = opts?.refresh ? "?refresh=1" : "";
  const res = await fetch(
    `${base}/v1/setup/providers/${encodeURIComponent(providerId)}/models${q}`,
    {
      headers: authHeaders(token),
    },
  );
  const json = (await res.json()) as ProviderModelsDto & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `provider_models_${res.status}`);
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
