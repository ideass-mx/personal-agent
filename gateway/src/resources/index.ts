export type { Resource, ResourceKind } from "./types.ts";
export { extractResources } from "./extract.ts";
export {
  DEFAULT_RESOURCE_RESOLUTION_POLICY,
  mergeResourceResolutionPolicy,
  type ResourceResolutionPolicy,
} from "./policy.ts";
export { sanitizeResourceUri } from "./sanitize-uri.ts";
export {
  assertUrlSafeForFetch,
  isBlockedHostname,
  isBlockedIpAddress,
} from "./ssrf.ts";
export {
  createResourceResolver,
  fetchWithSsrfGuards,
  ResourceResolver,
  type ResolutionStatus,
  type ResourceResolutionResult,
  type ResourceResolverDeps,
} from "./resolve.ts";
