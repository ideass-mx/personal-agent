/**
 * Manager de Agents lógicos: resuelve AgentDefinition para el Runtime.
 * No spawnea procesos. No orquesta multi-agent ni A2A.
 * No introduce agentId de protocolo/producto (instalación).
 */
import {
  DEFAULT_AGENT_DEFINITION_ID,
  type AgentDefinition,
} from "./definition.ts";
import {
  AgentRegistry,
  createDefaultAgentRegistry,
  type LogicalAgentKey,
} from "./registry.ts";
import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeDeps,
} from "./runtime.ts";
import {
  createBuiltinSkillRegistry,
  type SkillRegistry,
} from "./skills/index.ts";

export class AgentManager {
  constructor(
    private readonly registry: AgentRegistry = createDefaultAgentRegistry(),
    private activeKey: LogicalAgentKey = DEFAULT_AGENT_DEFINITION_ID,
    private readonly skills: SkillRegistry = createBuiltinSkillRegistry(),
  ) {
    if (!this.registry.has(this.activeKey)) {
      const first = this.registry.list()[0];
      if (!first) {
        throw new Error("AgentManager: registry vacío");
      }
      this.activeKey = first.id;
    }
  }

  getDefaultAgentId(): LogicalAgentKey {
    return DEFAULT_AGENT_DEFINITION_ID;
  }

  getDefaultAgent(): AgentDefinition {
    return this.resolveAgent(this.getDefaultAgentId());
  }

  getAgent(id: LogicalAgentKey): AgentDefinition | undefined {
    return this.registry.get(id);
  }

  listAgents(): AgentDefinition[] {
    return this.registry.list();
  }

  /**
   * Resuelve una definición. Sin id → Agent activo (default del deployment).
   */
  resolveAgent(id?: LogicalAgentKey): AgentDefinition {
    const key = id ?? this.activeKey;
    const def = this.registry.get(key);
    if (!def) {
      throw new Error(`Agent desconocido: ${key}`);
    }
    return def;
  }

  getActiveKey(): LogicalAgentKey {
    return this.activeKey;
  }

  /** Definición del Agent activo (default de conversaciones actuales). */
  getActiveDefinition(): AgentDefinition {
    return this.resolveAgent(this.activeKey);
  }

  setActive(key: LogicalAgentKey): void {
    if (!this.registry.has(key)) {
      throw new Error(`Agent no registrado: ${key}`);
    }
    this.activeKey = key;
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getSkillRegistry(): SkillRegistry {
    return this.skills;
  }

  /**
   * Crea un AgentRuntime ligado a una definición.
   * Un Runtime por llamada (captura la definición); no es un proceso OS.
   */
  createRuntime(
    deps: Omit<AgentRuntimeDeps, "agent" | "skills"> & {
      agent?: AgentDefinition;
      skills?: SkillRegistry;
    },
    agentId?: LogicalAgentKey,
  ): AgentRuntime {
    const agent = deps.agent ?? this.resolveAgent(agentId);
    return createAgentRuntime({
      ...deps,
      agent,
      skills: deps.skills ?? this.skills,
    });
  }
}

export function createDefaultAgentManager(): AgentManager {
  return new AgentManager();
}
