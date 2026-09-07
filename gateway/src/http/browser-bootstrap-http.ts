import type { Context, Hono } from "hono";
import { config } from "../config.ts";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireOwnerHost } from "./owner-auth.ts";
import {
  isLoopbackHostHeader,
  isLoopbackRequest,
} from "./remote-access.ts";
import {
  browserBootstrapHtml,
  browserSessionSetCookie,
  consumeBrowserLaunchSession,
  createBrowserLaunchSession,
} from "./browser-session.ts";

export function mountBrowserBootstrapHttp(
  app: Hono,
  deps: { hubToken: string },
): void {
  app.post("/v1/host/browser-sessions", async (c) => {
    const gated = requireOwnerHost(c, deps.hubToken);
    if (gated instanceof Response) return gated;
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
    // OWNER_LOCAL activate: Host header + peer address (when remote bind).
    if (!isLoopbackHostHeader(c.req.header("host")) || !isLoopbackRequest(c)) {
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
