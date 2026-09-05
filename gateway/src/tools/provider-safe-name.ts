const MAX_PROVIDER_TOOL_NAME = 64;

export function toProviderSafeToolName(name: string): string {
  const normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized.slice(0, MAX_PROVIDER_TOOL_NAME);
}

