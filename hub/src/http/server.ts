import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";
import type { AgentRuntime } from "../agent/runtime.ts";
import { config } from "../config.ts";
import { runMigrations } from "../db/database.ts";
import { connectedDevices } from "./sessions.ts";
import { attachGateway } from "./ws.ts";
import { mountWorkspaceHttp } from "./workspace-http.ts";
import { resolveConsoleStaticRoot } from "./console-static.ts";
import type { WorkspaceStore } from "../workspace/types.ts";

export type StartedHubServer = {
  close: () => Promise<void>;
  /** Persistencia de Workspace; el Runtime no la ve. */
  workspaces?: WorkspaceStore;
};

export { resolveConsoleStaticRoot } from "./console-static.ts";

/** CORS solo para desarrollo Vite explícito — no producción abierta. */
function mountDevCors(app: Hono): void {
  const origin = process.env.AGENT_CONSOLE_DEV_ORIGIN?.trim();
  if (!origin) return;
  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });
}

function mountAgentConsoleStatic(app: Hono, rootAbs: string): void {
  // @hono/node-server serveStatic exige root relativo al cwd.
  const rel = path.relative(process.cwd(), rootAbs) || ".";
  app.use(
    "/*",
    serveStatic({
      root: rel,
      index: "index.html",
    }),
  );
}

/** Arranca HTTP (Hono), health y el WebSocket en `/ws`. */
export function startServer(
  runtime: AgentRuntime,
  extras?: {
    agentReady?: boolean;
    agentTools?: string[];
    workspaces?: WorkspaceStore;
  },
): StartedHubServer {
  runMigrations();

  const app = new Hono();
  mountDevCors(app);

  app.get("/health", (c) =>
    c.json({
      ok: true,
      name: "personal-agent-api",
      devices: connectedDevices(),
      agentReady: extras?.agentReady ?? false,
      agentTools: extras?.agentTools ?? [],
    }),
  );

  if (extras?.workspaces) {
    mountWorkspaceHttp(app, {
      workspaces: extras.workspaces,
      hubToken: config.hubToken,
    });
  }

  const consoleRoot = resolveConsoleStaticRoot();
  if (consoleRoot) {
    mountAgentConsoleStatic(app, consoleRoot);
    process.stderr.write(`[hub] Agent Console static: ${consoleRoot}\n`);
  } else {
    process.stderr.write(
      "[hub] Agent Console static no encontrada (web/dist o dist/web)\n",
    );
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    process.stderr.write(
      `[hub] HTTP en http://localhost:${info.port}\n`,
    );
    process.stderr.write(
      `[hub] WebSocket en ws://localhost:${info.port}/ws\n`,
    );
    if (consoleRoot) {
      process.stderr.write(
        `[hub] Agent Console en http://localhost:${info.port}/\n`,
      );
    }
  });

  attachGateway(server as import("node:http").Server, runtime);

  return {
    close: () =>
      new Promise((resolve, reject) => {
        const nodeServer = server as import("node:http").Server;
        nodeServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    workspaces: extras?.workspaces,
  };
}
