/**
 * Política explícita de resolución de Resource.
 * Defaults conservadores: sin red, sin persistencia.
 */
import { DEFAULT_MAX_OBJECT_BYTES } from "../storage/types.ts";

export type ResourceResolutionPolicy = {
  readonly allowExternal: boolean;
  readonly allowHttp: boolean;
  readonly allowHttps: boolean;
  readonly allowFile: boolean;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly persist: boolean;
  readonly allowedMimeTypes?: readonly string[];
  readonly blockedMimeTypes?: readonly string[];
  /** Root para file:// (containment). Obligatorio si allowFile. */
  readonly filesystemRoot?: string;
};

export const DEFAULT_RESOURCE_RESOLUTION_POLICY: ResourceResolutionPolicy =
  Object.freeze({
    allowExternal: false,
    allowHttp: false,
    allowHttps: false,
    allowFile: false,
    maxBytes: DEFAULT_MAX_OBJECT_BYTES,
    timeoutMs: 15_000,
    maxRedirects: 3,
    persist: false,
  });

export function mergeResourceResolutionPolicy(
  overrides?: Partial<ResourceResolutionPolicy>,
): ResourceResolutionPolicy {
  return {
    ...DEFAULT_RESOURCE_RESOLUTION_POLICY,
    ...overrides,
    maxBytes:
      overrides?.maxBytes ?? DEFAULT_RESOURCE_RESOLUTION_POLICY.maxBytes,
    timeoutMs:
      overrides?.timeoutMs ?? DEFAULT_RESOURCE_RESOLUTION_POLICY.timeoutMs,
    maxRedirects:
      overrides?.maxRedirects ?? DEFAULT_RESOURCE_RESOLUTION_POLICY.maxRedirects,
  };
}
