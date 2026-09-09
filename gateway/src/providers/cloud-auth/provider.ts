/**
 * Personal Agent Cloud LLM provider — LLMProvider only.
 * Auth / session stay outside AgentRuntime.
 */
import { AgentDiagnosticError } from "../../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../../diagnostics/store.ts";
import { createOpenAiCompatibleProvider } from "../openai-compatible.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../types.ts";
import { CloudAuthError, userMessageForCloudAuth } from "./types.ts";
import type { CloudAuthClient } from "./client.ts";

export type CreatePersonalAgentCloudProviderInput = {
  baseUrl: string;
  model: string;
  auth: CloudAuthClient;
  extraHeaders?: Record<string, string>;
  diagnostics?: SqliteDiagnosticsStore;
  /** Inject for tests — wraps OpenAI-compatible stream. */
  createInner?: (accessToken: string) => LLMProvider;
};

function mapCloudAuthToDiagnostic(
  err: CloudAuthError,
  request: LLMRequest,
  model: string,
): AgentDiagnosticError {
  const code =
    err.code === "CLOUD_AUTH_UNAVAILABLE"
      ? "LLM_PROVIDER_UNAVAILABLE"
      : "LLM_AUTH_FAILED";
  return new AgentDiagnosticError({
    message: userMessageForCloudAuth(err.code),
    component: "LLM_PROVIDER",
    stage: "LLM_REQUEST",
    errorCode: code,
    diagnosticId: request.diagnosticId,
    metadata: {
      provider: "personal-agent-cloud",
      model,
      cloudAuthCode: err.code,
    },
  });
}

export function createPersonalAgentCloudProvider(
  input: CreatePersonalAgentCloudProviderInput,
): LLMProvider {
  const base = input.baseUrl.replace(/\/+$/, "");

  function innerForToken(accessToken: string): LLMProvider {
    if (input.createInner) return input.createInner(accessToken);
    return createOpenAiCompatibleProvider({
      providerId: "personal-agent-cloud",
      baseUrl: `${base}/v1`,
      model: input.model,
      apiKey: accessToken,
      extraHeaders: input.extraHeaders,
      diagnostics: input.diagnostics,
    });
  }

  return {
    id: "personal-agent-cloud",
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: false,
      structuredOutput: false,
    },
    async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
      let token: string;
      try {
        token = await input.auth.ensureAccessToken();
      } catch (err) {
        if (err instanceof CloudAuthError) {
          throw mapCloudAuthToDiagnostic(err, request, input.model);
        }
        throw err;
      }

      const runOnce = async function* (
        accessToken: string,
      ): AsyncGenerator<LLMEvent> {
        const provider = innerForToken(accessToken);
        for await (const ev of provider.stream(request)) {
          yield ev;
        }
      };

      try {
        for await (const ev of runOnce(token)) {
          yield ev;
        }
        return;
      } catch (err) {
        const is401 =
          err instanceof AgentDiagnosticError &&
          (err.httpStatus === 401 || err.errorCode === "LLM_AUTH_FAILED");
        if (!is401) throw err;

        // One refresh + one retry only.
        try {
          const refreshed = await input.auth.refresh();
          for await (const ev of runOnce(refreshed)) {
            yield ev;
          }
        } catch (retryErr) {
          if (retryErr instanceof CloudAuthError) {
            throw mapCloudAuthToDiagnostic(retryErr, request, input.model);
          }
          if (retryErr instanceof AgentDiagnosticError) {
            throw new AgentDiagnosticError({
              message: userMessageForCloudAuth("CLOUD_AUTH_SESSION_EXPIRED"),
              component: "LLM_PROVIDER",
              stage: "LLM_REQUEST",
              errorCode: "LLM_AUTH_FAILED",
              diagnosticId: request.diagnosticId,
              httpStatus: retryErr.httpStatus,
              metadata: {
                provider: "personal-agent-cloud",
                model: input.model,
                cloudAuthCode: "CLOUD_AUTH_SESSION_EXPIRED",
              },
            });
          }
          throw retryErr;
        }
      }
    },
  };
}
