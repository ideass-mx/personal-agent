import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "../config.ts";
import { runMigrations } from "../db/database.ts";
import { connectedDevices } from "./sessions.ts";
import { attachGateway } from "./ws.ts";

/** Arranca HTTP (Hono), health y el WebSocket en `/ws`. */
export function startServer(): void {
  runMigrations();

  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, name: "personal-agent-api", devices: connectedDevices() }),
  );

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[api] Agente despierto en http://localhost:${info.port}`);
    console.log(`[api] WebSocket en ws://localhost:${info.port}/ws`);
  });

  attachGateway(server as import("node:http").Server);
}
