import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";
import type { AgentRuntime } from "../agents/runtime.ts";
import { config } from "../config.ts";
import { runMigrations } from "../db/database.ts";
import { ensureLocalIdentity } from "../identity/ensure-local.ts";
import { connectedDevices } from "../sessions/index.ts";
import { attachGateway } from "../ws/index.ts";
import { mountWorkspaceHttp } from "./workspace-http.ts";
import { mountPairingHttp } from "./pairing-http.ts";
import { mountArtifactHttp } from "./artifact-http.ts";
import { mountBrowserBootstrapHttp } from "./browser-bootstrap-http.ts";
import { mountDiagnosticsHttp } from "./diagnostics-http.ts";
import { mountSetupHttp } from "./setup-http.ts";
import { mountLocalModelHttp } from "./local-model-http.ts";
import { mountDevicesHttp } from "./devices-http.ts";
import { mountDeviceAuthHttp } from "./device-auth-http.ts";
import { mountIdentityHttp } from "./identity-http.ts";
import { mountUserMemoryHttp } from "./user-memory-http.ts";
import type { LocalModelManager } from "../local-llm/index.ts";
import {
  isLoopbackRequest,
  isRemoteAccessEnabled,
  logRemoteAccessEnabled,
} from "./remote-access.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { productVersionForHealth } from "../product-version.ts";
import { resolveConsoleStaticRoot } from "./console-static.ts";
import type { WorkspaceStore } from "../workspace/types.ts";
import type { ArtifactManager } from "../artifacts/manager.ts";
import type {
  NodeHealthSnapshot,
  NodeLifecycleStatus,
} from "../runtime/node-lifecycle.ts";

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
    c.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Device-Id, Range",
    );
    c.header(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
    );
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

export type StartServerExtras = {
  /**
   * Health dinámico del Node (PHASE 56.1).
   * Preferido sobre agentReady/agentTools estáticos.
   */
  getNodeHealth?: () => NodeHealthSnapshot;
  /** @deprecated snapshot de boot — usar getNodeHealth */
  agentReady?: boolean;
  /** @deprecated snapshot de boot — usar getNodeHealth */
  agentTools?: string[];
  workspaces?: WorkspaceStore;
  /** PHASE 58 — delivery HTTP de Artifacts. */
  artifacts?: ArtifactManager;
  diagnostics?: SqliteDiagnosticsStore;
  /** PHASE 61 — manager compartido con LocalProvider. */
  localModelManager?: LocalModelManager;
};

function resolveHealth(extras?: StartServerExtras): {
  agentReady: boolean;
  agentTools: string[];
  nodeStatus: NodeLifecycleStatus | "UNKNOWN";
} {
  if (extras?.getNodeHealth) {
    const snap = extras.getNodeHealth();
    return {
      agentReady: snap.agentReady,
      agentTools: snap.agentTools,
      nodeStatus: snap.nodeStatus,
    };
  }
  return {
    agentReady: extras?.agentReady ?? false,
    agentTools: extras?.agentTools ?? [],
    nodeStatus: extras?.agentReady ? "READY" : "UNKNOWN",
  };
}

/** Arranca HTTP (Hono), health y el WebSocket en `/ws`. */
export function startServer(
  runtime: AgentRuntime,
  extras?: StartServerExtras,
): StartedHubServer {
  runMigrations();
  const identity = ensureLocalIdentity();
  process.stderr.write(
    `[gateway] identity user=${identity.user.id} agent=${identity.agent.id}` +
      `${identity.created ? " (created)" : ""}\n`,
  );
  logRemoteAccessEnabled({ bindHost: config.bindHost, port: config.port });
  if (isRemoteAccessEnabled(config.bindHost) && extras?.diagnostics) {
    extras.diagnostics.record({
      diagnosticId: extras.diagnostics.createDiagnosticId(),
      component: "GATEWAY",
      stage: "REQUEST_RECEIVED",
      level: "WARN",
      event: "REMOTE_ACCESS_ENABLED",
      metadata: {
        bindHost: config.bindHost,
        port: config.port,
      },
    });
  }

  const app = new Hono();
  mountDevCors(app);

  app.get("/health", (c) => {
    // Off-loopback: availability only (PHASE 57.7). No inventory/secrets.
    if (!isLoopbackRequest(c)) {
      return c.json({ ok: true });
    }
    const health = resolveHealth(extras);
    const product = productVersionForHealth();
    return c.json({
      ok: true,
      name: "personal-agent-api",
      devices: connectedDevices(),
      agentReady: health.agentReady,
      agentTools: health.agentTools,
      nodeStatus: health.nodeStatus,
      product: product.product,
      version: product.version,
      build: product.build,
      commit: product.commit,
      platform: product.platform,
      architecture: product.architecture,
      builtAt: product.builtAt,
      ...(product.channel ? { channel: product.channel } : {}),
    });
  });

  if (extras?.workspaces) {
    mountWorkspaceHttp(app, {
      workspaces: extras.workspaces,
      hubToken: config.hubToken,
    });
  }

  mountPairingHttp(app, {
    hubToken: config.hubToken,
    getAgentId: () => config.agentId,
    getPreferredWsEndpoint: () => `ws://127.0.0.1:${config.port}/ws`,
  });

  mountSetupHttp(app, {
    hubToken: config.hubToken,
  });

  mountLocalModelHttp(app, {
    hubToken: config.hubToken,
    manager: extras?.localModelManager,
  });

  mountDevicesHttp(app, {
    hubToken: config.hubToken,
  });

  mountDeviceAuthHttp(app, { hubToken: config.hubToken });

  mountIdentityHttp(app, {
    hubToken: config.hubToken,
  });

  mountUserMemoryHttp(app, {
    hubToken: config.hubToken,
  });

  mountBrowserBootstrapHttp(app, {
    hubToken: config.hubToken,
  });

  if (extras?.diagnostics) {
    mountDiagnosticsHttp(app, {
      hubToken: config.hubToken,
      diagnostics: extras.diagnostics,
    });
  }

  if (extras?.artifacts) {
    mountArtifactHttp(app, {
      artifacts: extras.artifacts,
      hubToken: config.hubToken,
    });
  }

  const consoleRoot = resolveConsoleStaticRoot();
  if (consoleRoot) {
    mountAgentConsoleStatic(app, consoleRoot);
    process.stderr.write(`[gateway] Agent Console static: ${consoleRoot}\n`);
  } else {
    process.stderr.write(
      "[gateway] Agent Console static no encontrada (web/dist o dist/web)\n",
    );
  }

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.bindHost,
    },
    (info) => {
      const host = config.bindHost;
      process.stderr.write(
        `[gateway] HTTP en http://${host}:${info.port} (bind=${host})\n`,
      );
      process.stderr.write(
        `[gateway] WebSocket en ws://${host}:${info.port}/ws\n`,
      );
      if (consoleRoot) {
        process.stderr.write(
          `[gateway] Agent Console en http://${host}:${info.port}/\n`,
        );
      }
    },
  );

  attachGateway(server as import("node:http").Server, runtime, extras?.diagnostics);

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
