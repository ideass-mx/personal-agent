/**
 * HTTP Setup — product onboarding / LLM configuration.
 * PHASE 58.3: local owner may use install_compat OR browser AuthSession (loopback).
 * No secrets in responses. Source of truth: setup_state SQLite + credential files.
 */
import type { Context, Hono } from "hono";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireLocalProductSetup } from "./owner-auth.ts";
import {
  getSetupState,
  transitionSetupState,
} from "../setup/setup-store.ts";
import {
  SetupStates,
  isSetupState,
  toSetupStatusDto,
  type SetupState,
} from "../setup/types.ts";
import {
  hasProviderApiKeyConfigured,
  writePersistedProviderApiKey,
} from "../setup/llm-key.ts";
import {
  isAnyLlmConfigured,
  isProviderAvailable,
  listProviders,
  verifyProviderConnectivity,
  type LlmConnectivityResult,
} from "../providers/registry.ts";
import {
  disconnectExternalProvider,
  applyModelDiscoveryToConnection,
  getIntelligenceConnection,
  getIntelligenceStatusSnapshot,
  listIntelligenceConnections,
  localAvailabilitySummary,
  selectIntelligenceConnection,
  updateIntelligenceConnectionModel,
  upsertExternalConnection,
} from "../providers/intelligence.ts";
import {
  discoverProviderModels,
  type ModelDiscoveryResult,
} from "../providers/model-discovery.ts";
import {
  getCloudAuthClient,
  isCloudDevAuthEnabled,
  resolvePersonalAgentCloudBaseUrl,
  userMessageForCloudAuth,
  CloudAuthError,
} from "../providers/cloud-auth/index.ts";
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";
import {
  createLocalModelManager,
  isLocalLlmConfigured,
} from "../local-llm/index.ts";

function cloudReady(): boolean {
  return Boolean(resolvePersonalAgentCloudBaseUrl()) || isCloudDevAuthEnabled();
}

function setupStatusPayload() {
  const record = getSetupState();
  const dto = toSetupStatusDto(record);
  const activeConn = getIntelligenceConnection();
  const providerId = (activeConn?.provider || record.llmProvider || "local").toLowerCase();
  // Reflect real readiness — local model file OR cloud key.
  const keyOk =
    providerId === "local"
      ? isLocalLlmConfigured(createLocalModelManager())
      : providerId === "personal-agent-cloud"
        ? cloudReady()
        : hasProviderApiKeyConfigured(providerId);
  // Also accept: any LLM ready even if setup_state provider lags.
  const anyOk = keyOk || isAnyLlmConfigured();
  const staleReadyWithoutKey =
    !anyOk &&
    (record.state === SetupStates.READY ||
      record.state === SetupStates.VERIFIED ||
      record.state === SetupStates.LLM_CONNECTED);
  return {
    ...dto,
    state: staleReadyWithoutKey ? SetupStates.LLM_REQUIRED : dto.state,
    llmConfigured: anyOk,
    llmProvider: activeConn?.provider || providerId,
    intelligenceMode: activeConn?.mode,
    onboardingCompleted: Boolean(dto.onboardingCompleted && anyOk),
  };
}

function connectivityPublicShape(
  result: LlmConnectivityResult,
  fallbackProvider: string,
) {
  return {
    provider: result.provider || fallbackProvider,
    model: result.model || DEFAULT_AGENT_MODEL,
    credentialConfigured: true as const,
    request: "success" as const,
    discovery: result.discovery
      ? {
          status: result.discovery.status,
          authStatus: result.discovery.authStatus,
          modelStatus: result.discovery.modelStatus,
          recommendedModelId: result.discovery.recommendedModelId || null,
          modelSelection: result.discovery.modelSelection || "recommended",
          models: result.discovery.models.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            capabilities: m.capabilities,
            contextWindow: m.contextWindow,
          })),
        }
      : undefined,
  };
}

export function mountSetupHttp(
  app: Hono,
  deps: {
    hubToken: string;
    /** Override para tests; por defecto llama al proveedor real. */
    verifyLlm?: (providerId: string) => Promise<LlmConnectivityResult>;
    /** Override discovery (tests / sin red). */
    discoverModels?: (input: {
      provider: string;
      connection?: {
        provider: string;
        modelId: string;
        baseUrl?: string;
      } | null;
      apiKey?: string;
      useCache?: boolean;
    }) => Promise<ModelDiscoveryResult>;
  },
): void {
  const runVerify = deps.verifyLlm ?? verifyProviderConnectivity;
  const runDiscover = deps.discoverModels ?? discoverProviderModels;
  /** Local product setup: install_compat OR browser AuthSession (loopback + owner). */
  const requireSetup = (c: Context) => {
    const gated = requireLocalProductSetup(c, deps.hubToken);
    if (gated instanceof Response) return gated;
    return null;
  };

  app.get("/v1/setup/status", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    return c.json(setupStatusPayload());
  });

  app.get("/v1/setup/providers", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const snap = getIntelligenceStatusSnapshot();
    return c.json({
      ok: true,
      providers: listProviders(),
      connections: snap.connections,
      selected: snap.active,
      local: snap.local,
      cloud: snap.cloud,
    });
  });

  /** Snapshot seguro para Intelligence Center + chat indicator. */
  app.get("/v1/setup/intelligence", (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    return c.json({ ok: true, ...getIntelligenceStatusSnapshot() });
  });

  app.post("/v1/setup/intelligence/select", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      connectionId?: string;
    };
    const connectionId = String(body.connectionId || "").trim();
    if (!connectionId) {
      return c.json(
        httpErrorBody("invalid_request", "Debes elegir un modo de inteligencia."),
        400,
      );
    }
    try {
      const selected = selectIntelligenceConnection(connectionId);
      let record = getSetupState();
      if (
        record.state === SetupStates.AGENT_READY ||
        record.state === SetupStates.ONBOARDING ||
        record.state === SetupStates.READY ||
        record.state === SetupStates.VERIFIED
      ) {
        record = transitionSetupState(SetupStates.LLM_REQUIRED, {
          llmProvider: selected.provider,
        });
      }
      return c.json({
        ...toSetupStatusDto(record),
        selected,
      });
    } catch {
      return c.json(
        httpErrorBody("connection_not_found", "No encontramos esa conexión."),
        404,
      );
    }
  });

  /**
   * Cambia el modelo de una inteligencia (Local / BYOK).
   * Personal Agent Cloud no admite elección de modelo.
   */
  app.post("/v1/setup/intelligence/model", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      connectionId?: string;
      modelId?: string;
    };
    const connectionId = String(body.connectionId || "").trim();
    const modelId = String(body.modelId || "").trim();
    if (!connectionId || !modelId) {
      return c.json(
        httpErrorBody(
          "invalid_request",
          "Se requieren connectionId y modelId.",
        ),
        400,
      );
    }
    try {
      const connection = updateIntelligenceConnectionModel(
        connectionId,
        modelId,
      );
      return c.json({ ok: true, connection });
    } catch (err) {
      const message = err instanceof Error ? err.message : "model_update_failed";
      if (message === "connection_not_found") {
        return c.json(
          httpErrorBody("connection_not_found", "No encontramos esa conexión."),
          404,
        );
      }
      if (message === "model_not_allowed") {
        return c.json(
          httpErrorBody(
            "model_not_allowed",
            "Ese modelo no está disponible en Personal Agent Cloud.",
          ),
          400,
        );
      }
      if (message === "model_not_in_catalog") {
        return c.json(
          httpErrorBody(
            "model_not_in_catalog",
            "Ese modelo no está en el catálogo local.",
          ),
          400,
        );
      }
      if (message === "model_not_installed") {
        return c.json(
          httpErrorBody(
            "model_not_installed",
            "Instala ese modelo antes de usarlo.",
          ),
          400,
        );
      }
      if (message === "credential_required") {
        return c.json(
          httpErrorBody(
            "credential_required",
            "Conecta la API key antes de cambiar el modelo.",
          ),
          400,
        );
      }
      return c.json(
        httpErrorBody("model_update_failed", "No pudimos cambiar el modelo."),
        400,
      );
    }
  });

  app.post("/v1/setup/transition", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      state?: string;
      llmProvider?: string | null;
      errorCode?: string;
      errorMessage?: string;
    };
    if (!isSetupState(body.state)) {
      return c.json(
        httpErrorBody("invalid_state", "Estado de setup inválido"),
        400,
      );
    }
    const target = body.state as SetupState;
    // AGENT_READY / Gateway running ≠ producto listo: READY exige LLM real.
    if (
      (target === SetupStates.READY || target === SetupStates.VERIFIED) &&
      !isAnyLlmConfigured()
    ) {
      return c.json(
        httpErrorBody(
          "llm_required",
          "Instala el modelo local (o configura un proveedor) antes de continuar.",
        ),
        400,
      );
    }
    try {
      transitionSetupState(target, {
        llmProvider: body.llmProvider,
        lastErrorCode: body.errorCode ?? null,
        lastErrorMessage: body.errorMessage ?? null,
      });
      return c.json(setupStatusPayload());
    } catch (err) {
      const message = err instanceof Error ? err.message : "transition_failed";
      if (message.includes("transición ilegal")) {
        return c.json(httpErrorBody("illegal_transition", message), 409);
      }
      return c.json(httpErrorBody("transition_failed", message), 400);
    }
  });

  /**
   * Guarda credencial LLM. Acepta apiKey | credential.
   * Nunca devuelve la clave.
   */
  app.post("/v1/setup/llm", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      provider?: string;
      apiKey?: string;
      credential?: string;
      modelId?: string;
      baseUrl?: string;
      modelSelection?: "recommended" | "specific";
    };
    const provider = String(body.provider || "anthropic").trim().toLowerCase();
    if (!isProviderAvailable(provider)) {
      return c.json(
        httpErrorBody(
          "provider_unsupported",
          "Ese servicio de IA aún no está disponible.",
        ),
        400,
      );
    }
    if (provider === "personal-agent-cloud") {
      try {
        if (!cloudReady()) {
          return c.json(
            httpErrorBody(
              "CLOUD_AUTH_UNAVAILABLE",
              userMessageForCloudAuth("CLOUD_AUTH_UNAVAILABLE"),
            ),
            400,
          );
        }
        const cloud = listIntelligenceConnections().find(
          (x) => x.provider === "personal-agent-cloud",
        );
        if (!cloud) throw new Error("cloud_connection_missing");
        selectIntelligenceConnection(cloud.id);

        const { client } = await getCloudAuthClient();
        const status = await client.authenticate();
        if (!status.connected && !status.usingDevToken) {
          return c.json(
            httpErrorBody(
              status.errorCode || "CLOUD_AUTH_REQUIRED",
              userMessageForCloudAuth(
                status.errorCode || "CLOUD_AUTH_REQUIRED",
              ),
            ),
            400,
          );
        }

        let record = getSetupState();
        if (
          record.state === SetupStates.AGENT_READY ||
          record.state === SetupStates.ONBOARDING ||
          record.state === SetupStates.READY ||
          record.state === SetupStates.VERIFIED
        ) {
          record = transitionSetupState(SetupStates.LLM_REQUIRED, {
            llmProvider: "personal-agent-cloud",
          });
        }
        if (record.state === SetupStates.LLM_REQUIRED) {
          record = transitionSetupState(SetupStates.LLM_CONNECTED, {
            llmProvider: "personal-agent-cloud",
          });
        }
        return c.json({
          ...toSetupStatusDto(getSetupState()),
          llmConfigured: true,
          cloudAuth: {
            connected: true,
            deviceLabel: status.deviceLabel,
            sessionActive: status.sessionActive,
            usingDevToken: status.usingDevToken,
          },
        });
      } catch (err) {
        const code =
          err instanceof CloudAuthError
            ? err.code
            : "CLOUD_AUTH_UNAVAILABLE";
        return c.json(
          httpErrorBody(code, userMessageForCloudAuth(code)),
          400,
        );
      }
    }

    const apiKey = String(body.credential || body.apiKey || "").trim();
    const rawModelId = String(body.modelId || "").trim();
    const modelId = rawModelId;
    const modelSelection =
      body.modelSelection === "specific" || body.modelSelection === "recommended"
        ? body.modelSelection
        : rawModelId
          ? "specific"
          : "recommended";
    // Actualizar solo el modelo si ya hay clave guardada y no envían una nueva.
    if (
      apiKey.length < 16 &&
      modelId &&
      (provider === "openai" ||
        provider === "anthropic" ||
        provider === "xai" ||
        provider === "gemini" ||
        provider === "openrouter" ||
        provider === "groq" ||
        provider === "openai-compatible") &&
      hasProviderApiKeyConfigured(provider)
    ) {
      try {
        const existing = listIntelligenceConnections().find(
          (x) => x.provider === provider,
        );
        if (!existing) {
          return c.json(
            httpErrorBody(
              "connection_not_found",
              "No encontramos esa conexión.",
            ),
            404,
          );
        }
        const connection = updateIntelligenceConnectionModel(
          existing.id,
          modelId,
          { selection: modelSelection },
        );
        return c.json({
          ...setupStatusPayload(),
          llmConfigured: true,
          connection,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "model_update_failed";
        return c.json(
          httpErrorBody(
            message,
            "No pudimos actualizar el modelo de este proveedor.",
          ),
          400,
        );
      }
    }
    if (apiKey.length < 16) {
      try {
        const cur = getSetupState();
        if (
          cur.state === SetupStates.LLM_REQUIRED ||
          cur.state === SetupStates.AGENT_READY ||
          cur.state === SetupStates.ONBOARDING
        ) {
          if (
            cur.state === SetupStates.AGENT_READY ||
            cur.state === SetupStates.ONBOARDING
          ) {
            transitionSetupState(SetupStates.LLM_REQUIRED, {
              llmProvider: provider,
            });
          }
          transitionSetupState(SetupStates.LLM_CONFIGURATION_ERROR, {
            lastErrorCode: "invalid_credential",
            lastErrorMessage: "La clave no parece válida.",
          });
        }
      } catch {
        /* ignore */
      }
      return c.json(
        httpErrorBody("invalid_credential", "La clave no parece válida."),
        400,
      );
    }
    try {
      let discoveryPayload: unknown;
      if (
        provider === "openai" ||
        provider === "anthropic" ||
        provider === "xai" ||
        provider === "gemini" ||
        provider === "openrouter" ||
        provider === "groq" ||
        provider === "openai-compatible"
      ) {
        await upsertExternalConnection({
          provider,
          modelId: modelId || undefined,
          apiKey,
          baseUrl: body.baseUrl,
          modelSelection,
        });
        // Tras guardar la key: discovery + recomendación (sin secretos en respuesta).
        try {
          const conn = listIntelligenceConnections().find(
            (x) => x.provider === provider,
          );
          if (conn) {
            const discovery = await runDiscover({
              provider,
              connection: conn,
              apiKey,
              useCache: false,
            });
            if (discovery.authStatus === "failed") {
              disconnectExternalProvider(provider);
              return c.json(
                httpErrorBody(
                  "PROVIDER_AUTH_FAILED",
                  "La clave de acceso no es válida. Comprueba tu clave y vuelve a intentarlo.",
                ),
                400,
              );
            }
            if (discovery.discoveryStatus === "ok") {
              applyModelDiscoveryToConnection(conn.id, discovery);
            }
            discoveryPayload = {
              status: discovery.discoveryStatus,
              authStatus: discovery.authStatus,
              recommendedModelId: discovery.recommendedModelId || null,
              modelStatus:
                discovery.discoveryStatus === "ok"
                  ? discovery.models.length
                    ? "available"
                    : "unavailable"
                  : "not_discovered",
              models: discovery.models.map((m) => ({
                id: m.id,
                name: m.name || m.id,
              })),
            };
          }
        } catch {
          discoveryPayload = {
            status: "failed",
            authStatus: "unknown",
            recommendedModelId: null,
            modelStatus: "not_discovered",
            models: [],
          };
        }
      } else {
        writePersistedProviderApiKey(provider, apiKey);
      }
      let record = getSetupState();
      if (
        record.state === SetupStates.AGENT_READY ||
        record.state === SetupStates.ONBOARDING ||
        record.state === SetupStates.READY ||
        record.state === SetupStates.VERIFIED
      ) {
        record = transitionSetupState(SetupStates.LLM_REQUIRED, {
          llmProvider: provider,
        });
      }
      if (record.state === SetupStates.LLM_CONFIGURATION_ERROR) {
        record = transitionSetupState(SetupStates.LLM_REQUIRED, {
          llmProvider: provider,
        });
      }
      if (record.state === SetupStates.LLM_REQUIRED) {
        record = transitionSetupState(SetupStates.LLM_CONNECTED, {
          llmProvider: provider,
        });
      }
      return c.json({
        ...toSetupStatusDto(getSetupState()),
        llmConfigured: true,
        intelligence: getIntelligenceStatusSnapshot(),
        discovery: discoveryPayload,
      });
    } catch {
      return c.json(
        httpErrorBody(
          "llm_save_failed",
          "No pudimos guardar la configuración. Inténtalo de nuevo.",
        ),
        400,
      );
    }
  });

  /**
   * Prueba real vía LLMProvider (mismo contrato que AgentRuntime).
   */
  app.post("/v1/setup/verify", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const record0 = getSetupState();
    const providerId =
      getIntelligenceConnection()?.provider || record0.llmProvider || "local";
    if (providerId === "local") {
      if (!isLocalLlmConfigured(createLocalModelManager())) {
        return c.json(
          httpErrorBody(
            "llm_not_configured",
            "Instala el modelo local antes de continuar.",
          ),
          400,
        );
      }
    } else if (providerId === "personal-agent-cloud" && !cloudReady()) {
      return c.json(
        httpErrorBody(
          "CLOUD_AUTH_UNAVAILABLE",
          userMessageForCloudAuth("CLOUD_AUTH_UNAVAILABLE"),
        ),
        400,
      );
    } else if (
      providerId !== "personal-agent-cloud" &&
      !hasProviderApiKeyConfigured(providerId)
    ) {
      return c.json(
        httpErrorBody(
          "llm_not_configured",
          "Primero conecta el servicio de inteligencia.",
        ),
        400,
      );
    }
    try {
      let record = record0;
      if (record.state === SetupStates.LLM_CONNECTED) {
        record = transitionSetupState(SetupStates.VERIFYING);
      } else if (record.state === SetupStates.VERIFICATION_ERROR) {
        record = transitionSetupState(SetupStates.VERIFYING);
      }
      const connectivity = await runVerify(providerId);
      record = transitionSetupState(SetupStates.VERIFIED);
      return c.json({
        ...toSetupStatusDto(record),
        checks: {
          gateway: true,
          agent: true,
          intelligence: true,
        },
        connectivity: connectivityPublicShape(connectivity, providerId),
      });
    } catch {
      try {
        const cur = getSetupState();
        if (
          cur.state === SetupStates.VERIFYING ||
          cur.state === SetupStates.LLM_CONNECTED
        ) {
          transitionSetupState(SetupStates.VERIFICATION_ERROR, {
            lastErrorCode: "verification_failed",
            lastErrorMessage:
              "No pudimos conectar con tu proveedor de IA. Revisa la clave e inténtalo de nuevo.",
          });
        }
      } catch {
        /* ignore */
      }
      return c.json(
        httpErrorBody(
          "verification_failed",
          "No pudimos conectar con tu proveedor de IA. Revisa la clave e inténtalo de nuevo.",
        ),
        400,
      );
    }
  });

  /** Public Cloud session status (no tokens). */
  app.get("/v1/setup/cloud/status", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    if (!cloudReady()) {
      return c.json({
        ok: true,
        connected: false,
        deviceLabel: "Este equipo",
        sessionActive: false,
        usingDevToken: false,
        errorCode: "CLOUD_AUTH_UNAVAILABLE" as const,
      });
    }
    try {
      const { client } = await getCloudAuthClient();
      const status = await client.getPublicStatus();
      return c.json({ ok: true, ...status });
    } catch (err) {
      const code =
        err instanceof CloudAuthError ? err.code : "CLOUD_AUTH_UNKNOWN_ERROR";
      return c.json({
        ok: true,
        connected: false,
        deviceLabel: "Este equipo",
        sessionActive: false,
        usingDevToken: false,
        errorCode: code,
      });
    }
  });

  /** Disconnect Cloud session (does not revoke device). */
  app.post("/v1/setup/cloud/disconnect", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    try {
      if (cloudReady()) {
        const { client } = await getCloudAuthClient();
        await client.disconnect();
      }
      return c.json({ ok: true, connected: false });
    } catch {
      return c.json(
        httpErrorBody(
          "CLOUD_AUTH_UNKNOWN_ERROR",
          userMessageForCloudAuth("CLOUD_AUTH_UNKNOWN_ERROR"),
        ),
        400,
      );
    }
  });

  /** Reconnect Cloud (device auth handshake). */
  app.post("/v1/setup/cloud/connect", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    if (!cloudReady()) {
      return c.json(
        httpErrorBody(
          "CLOUD_AUTH_UNAVAILABLE",
          userMessageForCloudAuth("CLOUD_AUTH_UNAVAILABLE"),
        ),
        400,
      );
    }
    try {
      const cloud = listIntelligenceConnections().find(
        (x) => x.provider === "personal-agent-cloud",
      );
      if (cloud) selectIntelligenceConnection(cloud.id);
      const { client } = await getCloudAuthClient();
      const status = await client.authenticate();
      return c.json({
        ok: true,
        connected: status.connected || status.usingDevToken,
        deviceLabel: status.deviceLabel,
        sessionActive: status.sessionActive,
        usingDevToken: status.usingDevToken,
      });
    } catch (err) {
      const code =
        err instanceof CloudAuthError ? err.code : "CLOUD_AUTH_UNAVAILABLE";
      return c.json(httpErrorBody(code, userMessageForCloudAuth(code)), 400);
    }
  });

  /**
   * Disconnect BYOK provider credential (not Cloud / Local).
   * Never returns secrets.
   */
  app.post("/v1/setup/providers/:id/disconnect", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const id = c.req.param("id").trim().toLowerCase();
    if (id === "personal-agent-cloud") {
      return c.json(
        httpErrorBody(
          "use_cloud_disconnect",
          "Usa Desconectar de Personal Agent Cloud.",
        ),
        400,
      );
    }
    if (id === "local") {
      return c.json(
        httpErrorBody(
          "local_not_disconnectable",
          "El modelo local no se desconecta así. Puedes cambiar de inteligencia.",
        ),
        400,
      );
    }
    if (!isProviderAvailable(id)) {
      return c.json(
        httpErrorBody("provider_unsupported", "Ese proveedor no está disponible."),
        400,
      );
    }
    try {
      const view = disconnectExternalProvider(id);
      return c.json({
        ok: true,
        provider: id,
        connection: view,
        intelligence: getIntelligenceStatusSnapshot(),
      });
    } catch {
      return c.json(
        httpErrorBody(
          "disconnect_failed",
          "No pudimos desconectar este proveedor.",
        ),
        400,
      );
    }
  });

  /**
   * Catálogo de modelos descubiertos para un proveedor (sin secretos).
   * Refresh si ?refresh=1 o caché ausente/stale.
   */
  app.get("/v1/setup/providers/:id/models", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const id = c.req.param("id").trim().toLowerCase();
    if (!isProviderAvailable(id)) {
      return c.json(
        httpErrorBody("provider_unsupported", "Ese proveedor no está disponible."),
        400,
      );
    }
    if (id === "local") {
      return c.json({
        ok: true,
        provider: id,
        discoveryStatus: "unsupported",
        supportsModelDiscovery: false,
        recommendedModelId: null,
        models: [],
        message: "Local usa el catálogo instalado, no discovery remoto.",
      });
    }
    const conn = listIntelligenceConnections().find((x) => x.provider === id);
    if (
      id !== "personal-agent-cloud" &&
      !hasProviderApiKeyConfigured(id)
    ) {
      return c.json(
        httpErrorBody(
          "PROVIDER_NOT_CONFIGURED",
          "Este proveedor aún no está conectado.",
        ),
        400,
      );
    }
    const refresh = c.req.query("refresh") === "1";
    try {
      const discovery = await runDiscover({
        provider: id,
        connection: conn || undefined,
        useCache: !refresh,
      });
      if (discovery.authStatus === "failed") {
        return c.json(
          httpErrorBody(
            "PROVIDER_AUTH_FAILED",
            "La clave de acceso no es válida. Comprueba tu clave y vuelve a intentarlo.",
          ),
          401,
        );
      }
      if (conn && discovery.discoveryStatus === "ok") {
        applyModelDiscoveryToConnection(conn.id, discovery);
      }
      const snap = getIntelligenceStatusSnapshot();
      const view = snap.connections.find((x) => x.provider === id) || null;
      return c.json({
        ok: true,
        provider: id,
        discoveryStatus: discovery.discoveryStatus,
        authStatus: discovery.authStatus,
        supportsModelDiscovery: discovery.discoveryStatus !== "unsupported",
        recommendedModelId: discovery.recommendedModelId || null,
        modelStatus: view?.modelStatus || null,
        modelSelection: view?.modelSelection || null,
        modelId: view?.modelId || conn?.modelId || null,
        models: discovery.models.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          capabilities: m.capabilities,
          contextWindow: m.contextWindow,
          recommended: m.id === discovery.recommendedModelId,
        })),
      });
    } catch {
      return c.json(
        httpErrorBody(
          "MODEL_DISCOVERY_FAILED",
          "No pudimos obtener los modelos de este proveedor.",
        ),
        400,
      );
    }
  });

  /** Probar conexión del provider (sin devolver secretos). */
  app.post("/v1/setup/providers/:id/test", async (c) => {
    const denied = requireSetup(c);
    if (denied) return denied;
    const id = c.req.param("id").trim().toLowerCase();
    if (!isProviderAvailable(id)) {
      return c.json(
        httpErrorBody("provider_unsupported", "Ese proveedor no está disponible."),
        400,
      );
    }
    try {
      const result = await runVerify(id);
      const message =
        id === "xai"
          ? "Conexión correcta. Grok está disponible."
          : id === "gemini"
            ? "Conexión correcta. Gemini está disponible."
          : "La conexión funciona.";
      return c.json({
        ok: true,
        message,
        connectivity: connectivityPublicShape(result, id),
        intelligence: getIntelligenceStatusSnapshot(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const errCode =
        err && typeof err === "object" && "errorCode" in err
          ? String((err as { errorCode?: string }).errorCode || "")
          : "";
      const safeProviderMessage =
        err && typeof err === "object" && "metadata" in err
          ? String(
              ((err as { metadata?: { safeProviderMessage?: string } })
                .metadata?.safeProviderMessage || ""),
            )
          : "";
      const blob = `${msg} ${errCode} ${safeProviderMessage}`;
      let code = "PROVIDER_UNKNOWN_ERROR";
      let human =
        id === "xai"
          ? "No pudimos conectar con xAI."
          : "No pudimos validar la conexión. Comprueba tu conexión a Internet y vuelve a intentarlo.";
      if (
        /quota|credit|credits|spending|billing|provider_quota_exceeded|LLM_QUOTA_EXCEEDED/i.test(
          blob,
        )
      ) {
        code = "PROVIDER_QUOTA_EXCEEDED";
        human =
          id === "xai"
            ? "Tu cuenta de xAI no tiene crédito disponible o alcanzó su límite de gasto. Añade crédito en la consola de xAI e inténtalo de nuevo."
            : "La cuenta del proveedor no tiene crédito disponible o alcanzó su límite. Revisa el plan o el saldo e inténtalo de nuevo.";
      } else if (
        /auth|401|invalid_credential|missing_api_key|LLM_AUTH_FAILED/i.test(
          blob,
        ) ||
        (/403/i.test(blob) && !/quota|credit|spending/i.test(blob))
      ) {
        code = "PROVIDER_AUTH_FAILED";
        human =
          id === "xai"
            ? "No pudimos conectar con xAI. Comprueba tu clave e inténtalo de nuevo."
            : "La clave de acceso no es válida. Comprueba tu clave y vuelve a intentarlo.";
      } else if (/rate|429|LLM_RATE_LIMITED/i.test(blob)) {
        code = "PROVIDER_RATE_LIMITED";
        human =
          id === "xai"
            ? "xAI está temporalmente limitado. Puedes intentarlo nuevamente más tarde."
            : "El proveedor ha limitado temporalmente las solicitudes.";
      } else if (/base_url|ssrf|unsafe|invalid/i.test(blob)) {
        code = "PROVIDER_INVALID_REQUEST";
        human = "La dirección del proveedor no es válida.";
      } else if (
        /cloud|unavailable|network|5\d\d|provider_http_5|LLM_PROVIDER_UNAVAILABLE/i.test(
          blob,
        )
      ) {
        code = "PROVIDER_UNAVAILABLE";
        human =
          id === "xai"
            ? "No pudimos conectar con xAI."
            : "No pudimos conectar con este proveedor. Comprueba tu conexión a Internet y vuelve a intentarlo.";
      } else if (
        !hasProviderApiKeyConfigured(id) &&
        id !== "local" &&
        id !== "personal-agent-cloud"
      ) {
        code = "PROVIDER_NOT_CONFIGURED";
        human = "Este proveedor aún no está conectado.";
      }
      return c.json(httpErrorBody(code, human), 400);
    }
  });
}
