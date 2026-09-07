/**
 * HTTP pairing for Desktop host (Bearer install credential).
 * AuthZ: owner of PersonalAgent + install_compat host transport.
 * Device revoke cascades AuthSessions + WS kill (PHASE 57.4).
 */
import type { Context, Hono } from "hono";
import QRCode from "qrcode";
import {
  approvePairingSession,
  buildPairingUri,
  createPairingSession,
  getPairingSession,
  listAwaitingConfirmation,
  listTrustedDevices,
  rejectPairingSession,
} from "../pairing/store.ts";
import { revokeTrustedDevice } from "../identity/device-revoke.ts";
import { takePairingWaiter } from "../pairing/waiters.ts";
import type { ServerMessage } from "../../../packages/protocol/messages.ts";
import { requireOwnerHost } from "./owner-auth.ts";

function sendWs(
  ws: { readyState: number; OPEN: number; send: (s: string) => void },
  msg: ServerMessage,
) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export function mountPairingHttp(
  app: Hono,
  deps: {
    hubToken: string;
    getAgentId: () => string | null;
    getPreferredWsEndpoint: () => string;
  },
): void {
  const requireHost = (c: Context) => requireOwnerHost(c, deps.hubToken);

  app.post("/v1/pairing/sessions", async (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    const agentId = deps.getAgentId();
    if (!agentId) {
      return c.json({ ok: false, error: "agent_id_missing" }, 400);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      endpoint?: string;
    };
    const endpoint = String(body.endpoint || deps.getPreferredWsEndpoint()).trim();
    const created = createPairingSession();
    const uri = buildPairingUri({
      agentId,
      endpoint,
      pairingSessionId: created.id,
      pairingSecret: created.secret,
    });
    const qrDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });
    return c.json({
      ok: true,
      pairingSessionId: created.id,
      pairingSecret: created.secret,
      expiresAt: created.expiresAt,
      ttlMs: created.ttlMs,
      agentId,
      endpoint,
      uri,
      qrDataUrl,
      containsHubToken: false,
    });
  });

  app.get("/v1/pairing/sessions/:id", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    const row = getPairingSession(c.req.param("id"));
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({
      ok: true,
      id: row.id,
      status: row.status,
      expiresAt: row.expiresAt,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      platform: row.platform,
    });
  });

  app.get("/v1/pairing/pending", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    return c.json({ ok: true, pending: listAwaitingConfirmation() });
  });

  app.post("/v1/pairing/sessions/:id/approve", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    const id = c.req.param("id");
    const result = approvePairingSession(id);
    if (!result.ok) {
      return c.json(result, 400);
    }
    const waiter = takePairingWaiter(id);
    if (waiter) {
      sendWs(waiter.ws, {
        type: "pairing_result",
        pairingSessionId: id,
        status: "approved",
        deviceCredential: result.deviceCredential,
      });
    }
    return c.json({
      ok: true,
      deviceId: result.deviceId,
      deviceName: result.deviceName,
      platform: result.platform,
      deliveredToDevice: Boolean(waiter),
    });
  });

  app.post("/v1/pairing/sessions/:id/reject", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    const id = c.req.param("id");
    const result = rejectPairingSession(id);
    if (!result.ok) return c.json(result, 400);
    const waiter = takePairingWaiter(id);
    if (waiter) {
      sendWs(waiter.ws, {
        type: "pairing_result",
        pairingSessionId: id,
        status: "rejected",
      });
      try {
        waiter.ws.close();
      } catch {
        /* ignore */
      }
    }
    return c.json({ ok: true });
  });

  app.get("/v1/pairing/trusted-devices", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    return c.json({
      ok: true,
      devices: listTrustedDevices().map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        platform: d.platform,
        pairedAt: d.pairedAt,
        lastSeen: d.lastSeen,
        permissions: JSON.parse(d.permissions) as string[],
        status: d.status,
      })),
    });
  });

  app.post("/v1/pairing/trusted-devices/:deviceId/revoke", (c) => {
    const gated = requireHost(c);
    if (gated instanceof Response) return gated;
    const deviceId = c.req.param("deviceId");
    const result = revokeTrustedDevice(
      deviceId,
      gated.principal.userContext,
    );
    if (!result.ok) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "owner_mismatch" || result.code === "agent_not_found"
            ? 403
            : 400;
      return c.json(result, status);
    }
    return c.json({
      ok: true,
      deviceId,
      status: result.status,
      alreadyRevoked: result.alreadyRevoked,
      sessionsRevoked: result.sessionsRevoked.length,
      connectionsKilled: result.connectionsKilled,
    });
  });
}
