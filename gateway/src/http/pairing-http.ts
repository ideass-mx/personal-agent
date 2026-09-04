/**
 * HTTP control plane for Desktop pairing (Bearer = install credential / HUB_TOKEN).
 * Does not expose pairing secrets after create except the one-time create response.
 */
import type { Context, Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import {
  approvePairingSession,
  buildPairingUri,
  createPairingSession,
  getPairingSession,
  listAwaitingConfirmation,
  listTrustedDevices,
  rejectPairingSession,
  revokeTrustedDevice,
} from "../pairing/store.ts";
import { takePairingWaiter } from "../pairing/waiters.ts";
import type { ServerMessage } from "../../../packages/protocol/messages.ts";

function tokenMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

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
  const requireInstall = (c: Context) => {
    const t = bearer(c);
    if (!t || !tokenMatches(t, deps.hubToken)) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    return null;
  };

  app.post("/v1/pairing/sessions", async (c) => {
    const denied = requireInstall(c);
    if (denied) return denied;
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
    const denied = requireInstall(c);
    if (denied) return denied;
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
    const denied = requireInstall(c);
    if (denied) return denied;
    return c.json({ ok: true, pending: listAwaitingConfirmation() });
  });

  app.post("/v1/pairing/sessions/:id/approve", (c) => {
    const denied = requireInstall(c);
    if (denied) return denied;
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
    const denied = requireInstall(c);
    if (denied) return denied;
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
    const denied = requireInstall(c);
    if (denied) return denied;
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
    const denied = requireInstall(c);
    if (denied) return denied;
    const deviceId = c.req.param("deviceId");
    const result = revokeTrustedDevice(deviceId);
    if (!result.ok) {
      return c.json(result, result.code === "not_found" ? 404 : 400);
    }
    return c.json({
      ok: true,
      deviceId,
      status: result.status,
      alreadyRevoked: result.alreadyRevoked,
    });
  });
}
