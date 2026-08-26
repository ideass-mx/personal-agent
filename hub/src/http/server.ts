import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AgentRuntime } from "../agent/runtime.ts";
import { config } from "../config.ts";
import { runMigrations } from "../db/database.ts";
import { connectedDevices } from "./sessions.ts";
import { attachGateway } from "./ws.ts";
import { mountWorkspaceHttp } from "./workspace-http.ts";
import type { WorkspaceStore } from "../workspace/types.ts";

export type StartedHubServer = {
  close: () => Promise<void>;
  /** Persistencia de Workspace; el Runtime no la ve. */
  workspaces?: WorkspaceStore;
};

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

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    process.stderr.write(
      `[hub] HTTP en http://localhost:${info.port}\n`,
    );
    process.stderr.write(
      `[hub] WebSocket en ws://localhost:${info.port}/ws\n`,
    );
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
