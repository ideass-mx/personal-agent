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
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";
import {
  createLocalModelManager,
  isLocalLlmConfigured,
} from "../local-llm/index.ts";

function setupStatusPayload() {
  const record = getSetupState();
  const dto = toSetupStatusDto(record);
  const providerId = (record.llmProvider || "local").toLowerCase();
  // Reflect real readiness — local model file OR cloud key.
  const keyOk =
    providerId === "local"
      ? isLocalLlmConfigured(createLocalModelManager())
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
    llmProvider: providerId,
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
  };
}

export function mountSetupHttp(
  app: Hono,
  deps: {
    hubToken: string;
    /** Override para tests; por defecto llama al proveedor real. */
    verifyLlm?: (providerId: string) => Promise<LlmConnectivityResult>;
  },
): void {
  const runVerify = deps.verifyLlm ?? verifyProviderConnectivity;
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
    return c.json({ ok: true, providers: listProviders() });
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
    try {
      const record = transitionSetupState(body.state as SetupState, {
        llmProvider: body.llmProvider,
        lastErrorCode: body.errorCode ?? null,
        lastErrorMessage: body.errorMessage ?? null,
      });
      return c.json({
        ...toSetupStatusDto(record),
        llmConfigured: hasProviderApiKeyConfigured(
          record.llmProvider || "anthropic",
        ),
      });
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
    const apiKey = String(body.credential || body.apiKey || "").trim();
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
      writePersistedProviderApiKey(provider, apiKey);
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
    const providerId = record0.llmProvider || "local";
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
    } else if (!hasProviderApiKeyConfigured(providerId)) {
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
}
