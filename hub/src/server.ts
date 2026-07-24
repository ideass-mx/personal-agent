import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.ts";
import { attachGateway } from "./gateway/ws.ts";
import { connectedDevices } from "./gateway/sessions.ts";
import { runMigrations } from "./memory/db.ts";

runMigrations();

const app = new Hono();

app.get("/health", (c) =>
  c.json({ ok: true, name: "personal-agent-hub", devices: connectedDevices() }),
);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[hub] Agente despierto en http://localhost:${info.port}`);
  console.log(`[hub] WebSocket en ws://localhost:${info.port}/ws`);
});

attachGateway(server as import("node:http").Server);
