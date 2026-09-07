/**
 * PHASE 58 — Local user profile (display name). No secrets.
 */
import type { Hono } from "hono";
import { httpErrorBody } from "./bearer-auth.ts";
import { requireAgentOwner } from "./owner-auth.ts";
import { ensureLocalIdentity, LOCAL_USER_ID } from "../identity/index.ts";
import {
  isUserProfileComplete,
  updateUserDisplayName,
} from "../identity/store.ts";

export function mountIdentityHttp(
  app: Hono,
  deps: { hubToken: string },
): void {
  app.get("/v1/identity/me", (c) => {
    const gated = requireAgentOwner(c, deps.hubToken);
    if (gated instanceof Response) return gated;
    const { user, agent } = ensureLocalIdentity();
    return c.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        profileCompleted: isUserProfileComplete(user),
        createdAt: user.createdAt,
      },
      agent: {
        id: agent.id,
        name: agent.name,
      },
    });
  });

  app.patch("/v1/identity/me", async (c) => {
    const gated = requireAgentOwner(c, deps.hubToken);
    if (gated instanceof Response) return gated;
    ensureLocalIdentity();
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name = typeof body.name === "string" ? body.name : "";
    try {
      const user = updateUserDisplayName({ id: LOCAL_USER_ID, name });
      return c.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          profileCompleted: isUserProfileComplete(user),
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "bad_request";
      const status = code === "user_not_found" ? 404 : 400;
      const message =
        code === "user_name_blank"
          ? "Indica tu nombre."
          : code === "user_name_too_long"
            ? "El nombre es demasiado largo."
            : code === "user_name_reserved"
              ? "Elige un nombre distinto."
              : "No pudimos guardar tu nombre.";
      return c.json(httpErrorBody(code, message), status);
    }
  });
}
