/**
 * Punto de entrada del Local Node: MCP Server por stdio.
 * No es un Agent lógico (no razona). El Agent Runtime vive en el Gateway (`hub/`).
 * Logs solo a stderr: stdout es el transporte MCP.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadNodeConfig } from "./config.ts";
import { startLocalAgent } from "./lifecycle.ts";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const agent = await startLocalAgent(transport, { config: loadNodeConfig() });

  process.stderr.write("[agent] MCP stdio listo\n");

  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    process.stderr.write(`[agent] ${signal}, shutdown\n`);
    void agent.shutdown().then(
      () => process.exit(0),
      (err: unknown) => {
        process.stderr.write(`[agent] error en shutdown: ${String(err)}\n`);
        process.exit(1);
      },
    );
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

void main().catch((err: unknown) => {
  process.stderr.write(`[agent] fallo al arrancar: ${String(err)}\n`);
  process.exit(1);
});
