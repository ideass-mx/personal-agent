/**
 * Owner-scoped Trusted Devices API (PHASE 57.6).
 * Auth: any authenticated principal that owns the PersonalAgent
 * (install_compat, device, or browser) — not install-only.
 */
import type { Hono } from "hono";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireAgentOwner } from "./owner-auth.ts";
import { revokeTrustedDevice } from "../identity/device-revoke.ts";
import {
  getTrustedDeviceOwnership,
  listTrustedDevices,
} from "../pairing/store.ts";
import type { UserContext } from "../identity/types.ts";

export type TrustedDevicePublicDto = {
  deviceId: string;
  name: string | null;
  platform: string | null;
  status: "ACTIVE" | "REVOKED";
  pairedAt: string;
  lastSeen: string | null;
  identityStatus: "legacy" | "crypto_enrolled";
  hasPublicKey: boolean;
};

function devicesForOwner(ctx: UserContext): TrustedDevicePublicDto[] {
  return listTrustedDevices()
    .filter((d) => {
      const own = getTrustedDeviceOwnership(d.deviceId);
      if (!own) return false;
      if (own.userId && own.userId !== ctx.userId) return false;
      if (own.agentId && own.agentId !== ctx.agentId) return false;
      return true;
    })
    .map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      platform: d.platform,
      status: d.status,
      pairedAt: d.pairedAt,
      lastSeen: d.lastSeen,
      identityStatus: d.identityStatus,
      hasPublicKey: d.hasPublicKey,
    }));
}

export function mountDevicesHttp(
  app: Hono,
  deps: { hubToken: string },
): void {
  app.get("/v1/devices", (c) => {
    const gated = requireAgentOwner(c, deps.hubToken);
    if (gated instanceof Response) return gated;
    return c.json({
      ok: true,
      devices: devicesForOwner(gated.principal.userContext),
    });
  });

  app.post("/v1/devices/:deviceId/revoke", (c) => {
    const gated = requireAgentOwner(c, deps.hubToken);
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
      return c.json(httpErrorBody(result.code, result.message), status);
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
