/**
 * Fixture: mantiene el Agent vivo hasta SIGINT/SIGTERM.
 * Solo para tests de señales del Hub.
 */
import { attachLocalAgent } from "../../src/runtime/attach-agent.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

const agent = await attachLocalAgent({ registry: new ToolRegistry() });
process.stderr.write(`HOLD_PID=${agent.pid ?? ""}\n`);
process.stderr.write("HOLD_READY\n");

const stop = async () => {
  await agent.shutdown();
  process.exit(0);
};

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
