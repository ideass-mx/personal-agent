import type { Context, Hono } from "hono";
import { config } from "../config.ts";
import {
  authenticateHttpRequest,
  httpErrorBody,
} from "./bearer-auth.ts";
import {
  browserBootstrapHtml,
  browserSessionSetCookie,
  consumeBrowserLaunchSession,
  createBrowserLaunchSession,
} from "./browser-session.ts";

function isLoopbackHost(c: Context): boolean {
  const host = c.req.header("host")?.toLowerCase() || "";
  return (
    host.startsWith("127.0.0.1:") ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.startsWith("[::1]:") ||
    host === "[::1]"
  );
}

export function mountBrowserBootstrapHttp(
  app: Hono,
  deps: { hubToken: string },
): void {
  app.post("/v1/host/browser-sessions", async (c) => {
    const principal = authenticateHttpRequest(c, deps.hubToken);
    if (!principal || principal.kind !== "install") {
      return c.json(httpErrorBody("unauthorized", "No autorizado"), 401);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      deviceId?: string;
      deviceName?: string;
    };
    const created = createBrowserLaunchSession({
      deviceId: body.deviceId,
      deviceName: body.deviceName,
    });
    return c.json({
      ok: true,
      launchUrl: `http://127.0.0.1:${config.port}/v1/host/browser-sessions/${created.activationId}`,
      expiresAt: created.expiresAt,
      deviceId: created.deviceId,
      deviceName: created.deviceName,
    });
  });

  app.get("/v1/host/browser-sessions/:id", (c) => {
    if (!isLoopbackHost(c)) {
      return c.json(
        httpErrorBody("localhost_only", "Solo disponible desde este equipo."),
        403,
      );
    }
    const row = consumeBrowserLaunchSession(c.req.param("id"));
    if (!row) {
      return c.html(
        "<h1>No pudimos abrir Personal Agent</h1><p>Intenta de nuevo desde la bandeja.</p>",
        410,
      );
    }
    c.header("Set-Cookie", browserSessionSetCookie(row.cookieToken, row.expiresAt));
    c.header("Cache-Control", "no-store");
    return c.html(
      browserBootstrapHtml({
        deviceId: row.deviceId,
        deviceName: row.deviceName,
      }),
    );
  });
}

