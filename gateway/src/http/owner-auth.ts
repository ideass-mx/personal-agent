/**
 * HTTP AuthZ helpers: owner identity + optional host install transport.
 * PHASE 57.7: OWNER_LOCAL routes also require loopback peer.
 * PHASE 58.3: local product setup accepts browser AuthSession on loopback.
 */
import type { Context } from "hono";
import {
  authenticateHttpRequest,
  httpErrorBody,
  type HttpAuthPrincipal,
} from "./bearer-auth.ts";
import {
  assertAgentOwner,
  isInstallCompatTransport,
} from "../identity/owner.ts";
import { isLoopbackRequest } from "./remote-access.ts";

export type OwnerGateOk = { principal: HttpAuthPrincipal };

/**
 * Authenticated principal whose UserContext owns the PersonalAgent.
 * Remote: Trusted Device or browser AuthSession (install_compat rejected by auth).
 */
export function requireAgentOwner(
  c: Context,
  hubToken: string,
): OwnerGateOk | Response {
  const principal = authenticateHttpRequest(c, hubToken);
  if (!principal) {
    return c.json(httpErrorBody("unauthorized", "No autorizado"), 401);
  }
  const ownership = assertAgentOwner(principal.userContext);
  if (!ownership.ok) {
    return c.json(httpErrorBody(ownership.code, ownership.message), 403);
  }
  return { principal };
}

/**
 * Owner + host install transport (install_compat / HUB_TOKEN) + loopback peer.
 * OWNER_LOCAL: pairing / browser mint (not product setup UI).
 */
export function requireOwnerHost(
  c: Context,
  hubToken: string,
  opts?: { peerIsLoopback?: boolean },
): OwnerGateOk | Response {
  const loopback = opts?.peerIsLoopback ?? isLoopbackRequest(c);
  if (!loopback) {
    return c.json(
      httpErrorBody(
        "localhost_only",
        "Operación de host solo disponible en este equipo (loopback).",
      ),
      403,
    );
  }
  const gated = requireAgentOwner(c, hubToken);
  if (gated instanceof Response) return gated;
  if (!isInstallCompatTransport(gated.principal.userContext)) {
    return c.json(
      httpErrorBody(
        "install_compat_required",
        "Operación de host: se requiere credencial de instalación.",
      ),
      403,
    );
  }
  return gated;
}

function isBrowserAuthPrincipal(principal: HttpAuthPrincipal): boolean {
  return (
    principal.kind === "browser" &&
    principal.userContext.authKind === "browser"
  );
}

/**
 * PHASE 58.3 — Local product setup (onboarding / LLM) for the host console.
 *
 * Allowed on loopback only:
 *   A) install_compat + owner
 *   B) browser AuthSession + owner (HttpOnly cookie; never HUB_TOKEN in browser)
 *
 * Does NOT grant remote setup privilege to browser or install_compat.
 */
export function requireLocalProductSetup(
  c: Context,
  hubToken: string,
  opts?: { peerIsLoopback?: boolean },
): OwnerGateOk | Response {
  const loopback = opts?.peerIsLoopback ?? isLoopbackRequest(c);
  if (!loopback) {
    return c.json(
      httpErrorBody(
        "localhost_only",
        "Configuración de producto solo disponible en este equipo (loopback).",
      ),
      403,
    );
  }
  const gated = requireAgentOwner(c, hubToken);
  if (gated instanceof Response) return gated;
  const { principal } = gated;
  if (
    isInstallCompatTransport(principal.userContext) ||
    isBrowserAuthPrincipal(principal)
  ) {
    return gated;
  }
  return c.json(
    httpErrorBody(
      "setup_auth_required",
      "Se requiere sesión local del propietario para configurar el producto.",
    ),
    403,
  );
}
