import { randomUUID } from "node:crypto";
import {
  AgentDiagnosticError,
  toDiagnosticClientPayload,
} from "../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import type { DiagnosticClientPayload } from "../diagnostics/types.ts";
import type { TurnMemory } from "../memory/types.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
} from "../providers/types.ts";
import { toLLMToolDescriptor } from "../tools/descriptor.ts";
import { toProviderSafeToolName } from "../tools/provider-safe-name.ts";
import type { AgentTool, ToolResult } from "../tools/types.ts";
import {
  evaluateToolSafety,
  toolSafetyDeniedResult,
  toolSafetyDiagnosticMetadata,
} from "../tools/safety.ts";
import {
  createDefaultAgentDefinition,
  type AgentDefinition,
} from "./definition.ts";
import {
  confirmationInconsistentResult,
  confirmationUnavailableResult,
  toolResultForDecision,
  type ConfirmationPort,
  type ConfirmationRequest,
} from "./confirmation.ts";
import {
  createTurnSourceCollector,
} from "./sources.ts";
import {
  resolveAgentInstructions,
  type SkillRegistry,
} from "./skills/index.ts";

export type { TurnMemory } from "../memory/types.ts";

/** Eventos internos del runtime (no son el protocolo WS público). */
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "done";
      messageId: string;
      conversationId: string;
      sources?: import("../../../packages/protocol/messages.ts").AgentSource[];
    }
  | { type: "error"; message: string; diagnostic?: DiagnosticClientPayload }
  | {
      type: "confirm_request";
      confirmationId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      conversationId: string;
    };

export interface AgentTurnInput {
  conversationId?: string;
  deviceId?: string;
  diagnosticId?: string;
  /** Identidad opaca del turno (binding de confirmaciones). No es un objeto Session. */
  sessionId?: string;
  userMessage: string;
  /**
   * Frontera de identidad (PHASE 57.2). Opcional para tests legacy;
   * producción WS siempre la resuelve.
   */
  userContext?: import("../identity/types.ts").UserContext;
  /**
   * Puerto de confirmación para tools con executionMode "confirm".
   * Si falta y una tool pide confirm → fail-closed (no ejecuta).
   */
  confirmation?: ConfirmationPort;
}

/**
 * Puerto de invocación de Tools (Gateway lo implementa hoy con ToolRegistry).
 * El Runtime no nombra la clase ToolRegistry ni el SDK MCP.
 * En producción execute es RemoteAgentTool → MCP Adapter.
 */
export interface AgentRuntimeTools {
  get(name: string): AgentTool | undefined;
  list(): AgentTool[];
}

export interface AgentRuntimeDeps {
  /** Definición del Agent. Si se omite, se usa el Agent por defecto del deployment. */
  agent?: AgentDefinition;
  memory: TurnMemory;
  llm: LLMProvider;
  tools: AgentRuntimeTools;
  diagnostics?: SqliteDiagnosticsStore;
  /**
   * Registry de Skills. Obligatorio si AgentDefinition.skills tiene entradas.
   * Skills solo afectan el system prompt; no habilitan tools.
   */
  skills?: SkillRegistry;
}

/**
 * Runtime lógico dentro del proceso Gateway (no es un proceso OS).
 * Hoy el Gateway crea un Runtime al arrancar (singleton de proceso) con la
 * definición activa. createAgentRuntime captura prompt/model/enabledTools
 * de esa definición; otro Agent requiere otro createAgentRuntime.
 */
export interface AgentRuntime {
  runTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent>;
}

export const MAX_TOOL_ITERATIONS = 10;

const INTERNAL_ERROR_MESSAGE =
  "El agente tuvo un problema generando la respuesta.";

function toolResultForLlm(result: ToolResult): {
  content: string;
  isError: boolean;
} {
  if (result.ok) {
    return { content: JSON.stringify(result.content), isError: false };
  }
  return { content: JSON.stringify(result.error), isError: true };
}

async function executeToolSafe(
  execute: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await execute();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error ejecutando tool";
    return {
      ok: false,
      error: { code: "tool_exception", message },
    };
  }
}

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
  // Captura la definición al construir: un Runtime no muta ni comparte
  // prompt/model/policy/skills con otra definición registrada después.
  const agent = deps.agent ?? createDefaultAgentDefinition();
  const memory = deps.memory;
  const llm = deps.llm;
  const tools = filterToolsForAgent(deps.tools, agent);
  const systemPrompt = resolveSystemPrompt(agent, deps.skills);
  const diagnostics = deps.diagnostics;

  return {
    async *runTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent> {
      const diagnosticId =
        input.diagnosticId ||
        diagnostics?.createDiagnosticId() ||
        `PA-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      const startedAt = Date.now();
      try {
        const conversationId = memory.ensureConversation(input.conversationId);
        memory.addMessage(
          conversationId,
          "user",
          input.userMessage,
          input.deviceId,
        );
        diagnostics?.record({
          diagnosticId,
          component: "AGENT_RUNTIME",
          stage: "REQUEST_RECEIVED",
          level: "INFO",
          event: "REQUEST_STARTED",
          metadata: {
            inputLength: input.userMessage.length,
            hasConversationId: Boolean(input.conversationId),
            hasDeviceId: Boolean(input.deviceId),
            userId: input.userContext?.userId,
            agentId: input.userContext?.agentId,
            authKind: input.userContext?.authKind,
          },
        });

        const history = memory.getHistory(conversationId);
        const messages: LLMMessage[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const availableTools = tools.list();
        const providerToolNameMap = new Map<string, string>();
        const toolDescriptors = availableTools.map((tool) => {
          const safeName = toProviderSafeToolName(tool.name);
          const existing = providerToolNameMap.get(safeName);
          if (existing && existing !== tool.name) {
            throw new AgentDiagnosticError({
              message: `Tool names collide after provider normalization: ${existing}, ${tool.name}`,
              component: "AGENT_RUNTIME",
              stage: "TOOL_SELECTION",
              errorCode: "LLM_REQUEST_INVALID",
              diagnosticId,
            });
          }
          providerToolNameMap.set(safeName, tool.name);
          return {
            ...toLLMToolDescriptor(tool),
            name: safeName,
          };
        });
        let full = "";
        const sources = createTurnSourceCollector();

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const toolCalls: Array<{
            id: string;
            name: string;
            input: unknown;
          }> = [];
          let turnText = "";

          for await (const event of llm.stream({
            messages,
            tools:
              toolDescriptors.length > 0 ? toolDescriptors : undefined,
            system: systemPrompt,
            model: agent.model,
            diagnosticId,
          })) {
            if (event.type === "text_delta") {
              turnText += event.text;
              full += event.text;
              yield { type: "text_delta", text: event.text };
            } else if (event.type === "tool_call") {
              const internalToolName =
                providerToolNameMap.get(event.name) || event.name;
              toolCalls.push({
                id: event.id,
                name: internalToolName,
                input: event.input,
              });
            }
          }

          if (toolCalls.length === 0) {
            const finalized = sources.finalize();
            const messageId = memory.addMessage(
              conversationId,
              "assistant",
              full,
              undefined,
              finalized.length > 0 ? finalized : undefined,
            );
            diagnostics?.record({
              diagnosticId,
              component: "AGENT_RUNTIME",
              stage: "RESPONSE_ASSEMBLY",
              level: "INFO",
              event: "REQUEST_COMPLETED",
              durationMs: Date.now() - startedAt,
              metadata: {
                outputLength: full.length,
                historyCount: history.length,
                toolCount: 0,
                sourcesCount: finalized.length,
              },
            });
            yield {
              type: "done",
              messageId,
              conversationId,
              ...(finalized.length > 0 ? { sources: finalized } : {}),
            };
            return;
          }

          const assistantBlocks: LLMContentBlock[] = [];
          if (turnText) {
            assistantBlocks.push({ type: "text", text: turnText });
          }
          for (const call of toolCalls) {
            assistantBlocks.push({
              type: "tool_call",
              id: call.id,
              name: call.name,
              input: call.input,
            });
          }
          messages.push({ role: "assistant", content: assistantBlocks });

          const resultBlocks: LLMContentBlock[] = [];
          for (const call of toolCalls) {
            const tool = tools.get(call.name);
            const evaluation = evaluateToolSafety({
              toolName: call.name,
              policy: agent.toolPolicy,
              executionMode: tool?.executionMode,
              userContext: input.userContext,
            });
            diagnostics?.record({
              diagnosticId,
              component: "AGENT_RUNTIME",
              stage: "TOOL_SELECTION",
              level:
                evaluation.decision === "DENIED" ? "WARN" : "INFO",
              event: "TOOL_POLICY_DECISION",
              metadata: toolSafetyDiagnosticMetadata(evaluation, {
                sessionId: input.userContext?.sessionId ?? input.sessionId,
                deviceId: input.userContext?.deviceId ?? input.deviceId,
                userId: input.userContext?.userId,
                agentId: input.userContext?.agentId,
              }),
            });

            let result: ToolResult;

            if (evaluation.decision === "DENIED") {
              result = toolSafetyDeniedResult(evaluation, Boolean(tool));
            } else if (evaluation.decision === "CONFIRMATION_REQUIRED") {
              if (!tool) {
                result = toolSafetyDeniedResult(evaluation, false);
              } else if (!input.confirmation || !input.sessionId) {
                result = confirmationUnavailableResult();
              } else {
                const confirmationId = `cf_${randomUUID()}`;
                const request: ConfirmationRequest = {
                  confirmationId,
                  toolCallId: call.id,
                  toolName: tool.name,
                  input: call.input,
                  conversationId,
                  deviceId: input.deviceId,
                  sessionId: input.sessionId,
                };
                // Registrar la espera (input congelado) antes de notificar al cliente.
                const outcomePromise = input.confirmation.wait(request);
                yield {
                  type: "confirm_request",
                  confirmationId: request.confirmationId,
                  toolCallId: request.toolCallId,
                  toolName: request.toolName,
                  input: request.input,
                  conversationId: request.conversationId,
                };
                const outcome = await outcomePromise;

                if (outcome.decision !== "approved") {
                  result = toolResultForDecision(outcome.decision);
                } else {
                  const op = outcome.operation;
                  // Ejecutar SOLO la operación pendiente del servidor.
                  if (
                    op.conversationId !== conversationId ||
                    op.toolCallId !== call.id ||
                    op.toolName !== tool.name
                  ) {
                    result = confirmationInconsistentResult();
                  } else {
                    const toolNow = tools.get(op.toolName);
                    const recheck = evaluateToolSafety({
                      toolName: op.toolName,
                      policy: agent.toolPolicy,
                      executionMode: toolNow?.executionMode,
                      userContext: input.userContext,
                    });
                    if (
                      !toolNow ||
                      recheck.decision !== "CONFIRMATION_REQUIRED" ||
                      toolNow.name !== op.toolName
                    ) {
                      result = confirmationInconsistentResult();
                    } else {
                      result = await executeToolSafe(() =>
                        toolNow.execute(op.input, {
                          conversationId: op.conversationId,
                          deviceId: op.deviceId,
                        }),
                      );
                    }
                  }
                }
              }
            } else {
              // ALLOWED
              if (!tool) {
                result = toolSafetyDeniedResult(evaluation, false);
              } else {
                result = await executeToolSafe(() =>
                  tool.execute(call.input, {
                    conversationId,
                    deviceId: input.deviceId,
                  }),
                );
              }
            }

            const mapped = toolResultForLlm(result);
            sources.ingestTool(call.name, result);
            resultBlocks.push({
              type: "tool_result",
              toolCallId: call.id,
              content: mapped.content,
              isError: mapped.isError,
            });
          }
          messages.push({ role: "user", content: resultBlocks });
        }

        diagnostics?.record({
          diagnosticId,
          component: "AGENT_RUNTIME",
          stage: "TOOL_EXECUTION",
          level: "ERROR",
          event: "REQUEST_FAILED",
          errorCode: "TOOL_ITERATION_LIMIT",
          durationMs: Date.now() - startedAt,
        });
        yield {
          type: "error",
          message:
            "El agente superó el límite de iteraciones de herramientas.",
          diagnostic: {
            diagnosticId,
            component: "AGENT_RUNTIME",
            stage: "TOOL_EXECUTION",
            errorCode: "TOOL_ITERATION_LIMIT",
            timestamp: new Date().toISOString(),
          },
        };
      } catch (err) {
        const at = new Date().toISOString();
        if (err instanceof AgentDiagnosticError) {
          const propagatedDiagnosticId = err.diagnosticId || diagnosticId;
          diagnostics?.record({
            diagnosticId: propagatedDiagnosticId,
            component: "AGENT_RUNTIME",
            stage: err.stage,
            level: "ERROR",
            event: "REQUEST_FAILED",
            errorCode: err.errorCode,
            message: err.message,
            durationMs: Date.now() - startedAt,
            metadata: err.metadata,
          });
          yield {
            type: "error",
            message: INTERNAL_ERROR_MESSAGE,
            diagnostic: toDiagnosticClientPayload(
              new AgentDiagnosticError({
                diagnosticId: propagatedDiagnosticId,
                message: err.message,
                component: err.component,
                stage: err.stage,
                errorCode: err.errorCode,
                httpStatus: err.httpStatus,
                metadata: err.metadata,
              }),
              at,
            ),
          };
          return;
        }
        const message =
          err instanceof Error ? err.message : "agent_runtime_failed";
        diagnostics?.record({
          diagnosticId,
          component: "AGENT_RUNTIME",
          stage: "AGENT_RUNTIME",
          level: "ERROR",
          event: "REQUEST_FAILED",
          errorCode: "AGENT_RUNTIME_FAILED",
          message,
          durationMs: Date.now() - startedAt,
        });
        console.error("[gateway] error generando respuesta:", err);
        yield {
          type: "error",
          message: INTERNAL_ERROR_MESSAGE,
          diagnostic: {
            diagnosticId,
            component: "AGENT_RUNTIME",
            stage: "AGENT_RUNTIME",
            errorCode: "AGENT_RUNTIME_FAILED",
            timestamp: at,
          },
        };
      }
    },
  };
}

/** Aplica enabledTools (nombre exacto o prefijo de familia) sobre ToolRegistry. */
function filterToolsForAgent(
  tools: AgentRuntimeTools,
  agent: AgentDefinition,
): AgentRuntimeTools {
  const allowed = agent.enabledTools;
  if (!allowed || allowed.length === 0) return tools;
  return {
    get(name: string) {
      if (!toolNameAllowed(name, allowed)) return undefined;
      return tools.get(name);
    },
    list() {
      return tools.list().filter((t) => toolNameAllowed(t.name, allowed));
    },
  };
}

/**
 * Nombre exacto (`family.op`) o prefijo de familia (`family` → `family.*`).
 * Skills no participan en este filtro.
 */
export function toolNameAllowed(
  toolName: string,
  enabledTools: readonly string[],
): boolean {
  for (const entry of enabledTools) {
    if (entry === toolName) return true;
    if (!entry.includes(".") && toolName.startsWith(`${entry}.`)) return true;
  }
  return false;
}

function resolveSystemPrompt(
  agent: AgentDefinition,
  skills: SkillRegistry | undefined,
): string {
  const ids = agent.skills;
  if (!ids || ids.length === 0) {
    return agent.prompt;
  }
  if (!skills) {
    throw new Error(
      `Agent "${agent.id}" declara skills pero no hay SkillRegistry`,
    );
  }
  return resolveAgentInstructions(agent, skills);
}
