/**
 * Registro de Agents lógicos hospedados por el Gateway.
 * Solo definiciones: no ejecuta LLM, tools, MCP, WS ni pairing.
 *
 * La clave es `AgentDefinition.id` (lógico).
 * NO es `agentId` de instalación/producto (GatewayConfig.agentId).
 */
import {
  createDefaultAgentDefinition,
  type AgentDefinition,
} from "./definition.ts";

export type LogicalAgentKey = string;

export class AgentRegistry {
  private readonly agents = new Map<LogicalAgentKey, AgentDefinition>();

  /**
   * Registra una definición. La clave es `definition.id`.
   * Overload legacy: `register(key, definition)` — key debe coincidir con definition.id si definition tiene id.
   */
  register(definition: AgentDefinition): void;
  register(key: LogicalAgentKey, definition: AgentDefinition): void;
  register(
    keyOrDef: LogicalAgentKey | AgentDefinition,
    maybeDef?: AgentDefinition,
  ): void {
    let key: string;
    let definition: AgentDefinition;
    if (typeof keyOrDef === "string") {
      key = keyOrDef;
      definition = maybeDef!;
      if (definition.id !== key) {
        throw new Error(
          `AgentRegistry: key "${key}" no coincide con definition.id "${definition.id}"`,
        );
      }
    } else {
      definition = keyOrDef;
      key = definition.id;
    }
    if (this.agents.has(key)) {
      throw new Error(`Agent ya registrado: ${key}`);
    }
    this.agents.set(key, definition);
  }

  get(key: LogicalAgentKey): AgentDefinition | undefined {
    return this.agents.get(key);
  }

  has(key: LogicalAgentKey): boolean {
    return this.agents.has(key);
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  /** Entradas { key, definition } — key === definition.id. */
  entries(): Array<{ key: LogicalAgentKey; definition: AgentDefinition }> {
    return [...this.agents.entries()].map(([key, definition]) => ({
      key,
      definition,
    }));
  }

  /**
   * Quita una definición del registry in-memory.
   * No borra conversaciones ni pairing.
   */
  unregister(key: LogicalAgentKey): boolean {
    return this.agents.delete(key);
  }
}

/** Crea un registry con el Agent asistente por defecto. */
export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(createDefaultAgentDefinition());
  return registry;
}
