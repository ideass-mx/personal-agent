/**
 * PHASE 57.8 — HTTP Device cryptographic authentication.
 * Challenge-response → AuthSession. No private keys. No HUB_TOKEN.
 */
import type { Hono } from "hono";
import { httpErrorBody } from "./bearer-auth.ts";
import { verifyDeviceCredential } from "../pairing/store.ts";
import {
  issueDeviceAuthChallenge,
  verifyDeviceAuthSignature,
} from "../identity/device-auth.ts";
import { setDevicePublicKey } from "../identity/device-crypto-store.ts";
import { ensureHostTrustedDevice } from "../identity/ensure-host-device.ts";
import { touchTrustedDevice } from "../pairing/store.ts";
import { requireOwnerHost } from "./owner-auth.ts";
import { ENDPOINT_EXPOSURE_NOTES } from "./remote-access.ts";

void ENDPOINT_EXPOSURE_NOTES;

export function mountDeviceAuthHttp(
  app: Hono,
  deps?: { hubToken?: string },
): void {
  app.post("/v1/device-auth/challenge", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      deviceId?: string;
    };
    const deviceId = body.deviceId?.trim();
    if (!deviceId) {
      return c.json(httpErrorBody("bad_request", "deviceId requerido."), 400);
    }
    const issued = issueDeviceAuthChallenge(deviceId);
    if (!issued.ok) {
      const status =
        issued.reason === "revoked"
          ? 403
          : issued.reason === "unknown_device"
            ? 404
            : issued.reason === "legacy_no_public_key"
              ? 409
              : 400;
      return c.json(httpErrorBody(issued.reason, issued.message), status);
    }
    return c.json({
      ok: true,
      deviceId: issued.deviceId,
      challengeId: issued.challengeId,
      challenge: issued.challenge,
      expiresAt: issued.expiresAt,
    });
  });

  app.post("/v1/device-auth/verify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      deviceId?: string;
      challengeId?: string;
      signature?: string;
    };
    const result = verifyDeviceAuthSignature({
      deviceId: body.deviceId?.trim() || "",
      challengeId: body.challengeId?.trim() || "",
      signatureBase64: body.signature?.trim() || "",
    });
    if (!result.ok) {
      const status = result.replay
        ? 409
        : result.reason === "revoked" || result.reason === "owner_mismatch"
          ? 403
          : result.reason === "unknown_device"
            ? 404
            : 401;
      return c.json(httpErrorBody(result.reason, result.message), status);
    }
    touchTrustedDevice(body.deviceId!.trim());
    // Session established server-side; clients continue with WS or legacy HTTP proofs.
    // Do not return private material or a new global bearer.
    return c.json({
      ok: true,
      deviceId: body.deviceId!.trim(),
      authSessionId: result.session.id,
      authKind: result.userContext.authKind,
    });
  });

  /**
   * Upgrade legacy Trusted Device → crypto_enrolled.
   * Requires existing device credential (pairing already approved).
   */
  app.post("/v1/device-auth/enroll", async (c) => {
    const deviceId = c.req.header("X-Device-Id")?.trim();
    const auth = c.req.header("Authorization");
    const token = auth?.replace(/^Bearer\s+/i, "").trim();
    if (!deviceId || !token || !verifyDeviceCredential(deviceId, token)) {
      return c.json(httpErrorBody("unauthorized", "No autorizado."), 401);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      publicKey?: string;
      keyAlgorithm?: string;
    };
    const enrolled = setDevicePublicKey({
      deviceId,
      publicKey: body.publicKey?.trim() || "",
      keyAlgorithm: body.keyAlgorithm,
    });
    if (!enrolled.ok) {
      const status =
        enrolled.code === "public_key_conflict"
          ? 409
          : enrolled.code === "device_revoked"
            ? 403
            : enrolled.code === "not_found"
              ? 404
              : 400;
      return c.json(httpErrorBody(enrolled.code, enrolled.message), status);
    }
    return c.json({
      ok: true,
      deviceId,
      identityStatus: "crypto_enrolled",
      keyAlgorithm: "Ed25519",
    });
  });

  /**
   * Desktop host bootstrap (PHASE 57.10): register this PC as Trusted Device + publicKey.
   * OWNER_LOCAL — install_compat + loopback. Idempotent.
   */
  app.post("/v1/device-auth/ensure-host", async (c) => {
    const hubToken = deps?.hubToken;
    if (!hubToken) {
      return c.json(httpErrorBody("misconfigured", "Hub token no configurado."), 500);
    }
    const gated = requireOwnerHost(c, hubToken);
    if (gated instanceof Response) return gated;
    const body = (await c.req.json().catch(() => ({}))) as {
      deviceId?: string;
      publicKey?: string;
      deviceName?: string;
      platform?: string;
    };
    const result = ensureHostTrustedDevice({
      deviceId: body.deviceId?.trim() || "",
      publicKey: body.publicKey?.trim() || "",
      deviceName: body.deviceName,
      platform: body.platform,
    });
    if (!result.ok) {
      const status =
        result.code === "public_key_conflict" ||
        result.code === "public_key_mismatch"
          ? 409
          : result.code === "device_revoked"
            ? 403
            : 400;
      return c.json(httpErrorBody(result.code, result.message), status);
    }
    return c.json({
      ok: true,
      deviceId: result.deviceId,
      created: result.created,
      identityStatus: result.identityStatus,
      keyAlgorithm: "Ed25519",
    });
  });
}
