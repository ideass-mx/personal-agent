/**
 * Paths where product `agentId` (PersonalAgent / install / UserContext) is expected.
 * Not multi-agent selection — see PHASE 51b–57.2.
 */
export function allowsProductAgentId(relPosix: string): boolean {
  return (
    relPosix.endsWith("config.ts") ||
    relPosix.endsWith("http/server.ts") ||
    relPosix.endsWith("http/devices-http.ts") ||
    relPosix.endsWith("http/owner-auth.ts") ||
    relPosix.endsWith("agents/runtime.ts") ||
    relPosix.endsWith("tools/safety.ts") ||
    relPosix.includes("/pairing/") ||
    relPosix.includes("pairing-http") ||
    relPosix.includes("agents/definition") ||
    relPosix.includes("agents/registry") ||
    relPosix.includes("agents/manager") ||
    relPosix.includes("/identity/")
  );
}

/**
 * Optional `nodeId` on UserContext is declared in identity types (PHASE 57.2);
 * Node crypto identity is still not implemented.
 */
export function allowsUserContextNodeIdField(relPosix: string): boolean {
  return relPosix.includes("/identity/");
}
