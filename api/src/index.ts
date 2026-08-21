import { createAgentRuntime } from "./agent/runtime.ts";
import { startServer } from "./http/server.ts";
import {
  addMessage,
  ensureConversation,
  getHistory,
} from "./memory/history.ts";
import { createAnthropicProvider } from "./providers/anthropic.ts";
import { calculatorTool } from "./tools/calculator.ts";
import { ToolRegistry } from "./tools/registry.ts";

const llm = createAnthropicProvider();

const tools = new ToolRegistry();
tools.register(calculatorTool);

const agentRuntime = createAgentRuntime({
  memory: {
    ensureConversation,
    addMessage,
    getHistory,
  },
  llm,
  tools,
});

startServer(agentRuntime);
