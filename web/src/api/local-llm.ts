import type { SetupStatusDto } from "../types";

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

function localFetchInit(token: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "same-origin",
    headers: {
      ...authHeaders(token),
      ...(init?.headers || {}),
    },
  };
}

export type LocalRecommendationDto = {
  modelId: string;
  displayName: string;
  tierLabel: string;
  description: string;
  suitability: string;
  reason: string;
  estimatedMemoryGb?: number;
};

export type LocalModelsDto = {
  catalog: Array<{
    id: string;
    displayName: string;
    description: string;
    tierLabel: string;
    capabilities?: {
      streaming?: boolean;
      toolCalling?: boolean;
      contextWindow?: number;
    };
  }>;
  installed: Array<{
    modelId: string;
    variantId: string;
    state: string;
    displayName: string;
  }>;
  active: { modelId: string; variantId: string } | null;
};

export async function fetchLocalRecommendation(
  base: string,
  token: string,
): Promise<{
  recommendation: LocalRecommendationDto;
  hardware: { memoryGb: number; cpuCores: number };
}> {
  const res = await fetch(`${base}/v1/local-llm/recommendation`, localFetchInit(token));
  if (!res.ok) throw new Error(`local_rec_${res.status}`);
  return (await res.json()) as {
    recommendation: LocalRecommendationDto;
    hardware: { memoryGb: number; cpuCores: number };
  };
}

export async function fetchLocalModels(
  base: string,
  token: string,
): Promise<LocalModelsDto> {
  const res = await fetch(`${base}/v1/local-llm/models`, localFetchInit(token));
  if (!res.ok) throw new Error(`local_models_${res.status}`);
  return (await res.json()) as LocalModelsDto;
}

export async function activateLocalModel(
  base: string,
  token: string,
  opts: { modelId: string; variantId?: string },
): Promise<void> {
  const res = await fetch(
    `${base}/v1/local-llm/activate`,
    localFetchInit(token, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(json.error?.message || `local_activate_${res.status}`);
  }
}

export async function fetchLocalLlmStatus(
  base: string,
  token: string,
): Promise<{
  ready: boolean;
  model: {
    id: string;
    displayName: string;
    state: string;
    /** 0–100 mientras descarga / valida. */
    progress?: number;
  };
  install?: {
    phase: string;
    displayName: string;
    progress?: number;
    bytesReceived?: number;
    bytesTotal?: number;
    bytesPerSecond?: number;
    etaSeconds?: number;
    elapsedMs?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
}> {
  const res = await fetch(`${base}/v1/local-llm/status`, localFetchInit(token));
  if (!res.ok) throw new Error(`local_status_${res.status}`);
  return (await res.json()) as {
    ready: boolean;
    model: {
      id: string;
      displayName: string;
      state: string;
      progress?: number;
    };
    install?: {
      phase: string;
      displayName: string;
      progress?: number;
      bytesReceived?: number;
      bytesTotal?: number;
      bytesPerSecond?: number;
      etaSeconds?: number;
      elapsedMs?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
    } | null;
  };
}

export async function installLocalModel(
  base: string,
  token: string,
  opts?: { modelId?: string; variantId?: string },
): Promise<{ ok: boolean; model?: { id: string; displayName: string; state: string } }> {
  const res = await fetch(
    `${base}/v1/local-llm/install`,
    localFetchInit(token, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  );
  const json = (await res.json()) as {
    ok?: boolean;
    model?: { id: string; displayName: string; state: string };
    error?: {
      code: string;
      message: string;
      title?: string;
      technical?: string;
      modelOk?: boolean;
    };
  };
  if (!res.ok) {
    const err = new Error(json.error?.message || `install_${res.status}`) as Error & {
      code?: string;
      title?: string;
      technical?: string;
      modelOk?: boolean;
    };
    err.code = json.error?.code;
    err.title = json.error?.title;
    err.technical = json.error?.technical;
    err.modelOk = json.error?.modelOk;
    throw err;
  }
  return { ok: true, model: json.model };
}

/** Tras instalar modelo local, marcar setup READY vía verify + transition. */
export async function completeLocalSetup(
  base: string,
  token: string,
): Promise<SetupStatusDto> {
  const { transitionSetup, verifySetup } = await import("./setup");
  await transitionSetup(base, token, "LLM_REQUIRED", { llmProvider: "local" });
  await transitionSetup(base, token, "LLM_CONNECTED", { llmProvider: "local" });
  try {
    await verifySetup(base, token);
  } catch {
    /* verify puede fallar si runtime ausente; install ya marcó READY en gateway */
  }
  return transitionSetup(base, token, "READY", { llmProvider: "local" });
}
