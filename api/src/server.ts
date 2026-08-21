import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.ts";
import { attachGateway } from "./gateway/ws.ts";
import { connectedDevices } from "./gateway/sessions.ts";
import { runMigrations } from "./memory/db.ts";

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
