/** Modelos Claude expuestos por Personal Agent Cloud (fuente de verdad en Gateway). */
export const PERSONAL_AGENT_CLOUD_MODELS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export type PersonalAgentCloudModelId =
  (typeof PERSONAL_AGENT_CLOUD_MODELS)[number];

export function resolvePersonalAgentCloudModelId(modelId: string): string {
  const mid = modelId.trim();
  if (!mid || mid === "pa-cloud-default") return "claude-sonnet-4-6";
  return mid;
}

export function isPersonalAgentCloudModel(modelId: string): boolean {
  const mid = resolvePersonalAgentCloudModelId(modelId);
  return (PERSONAL_AGENT_CLOUD_MODELS as readonly string[]).includes(mid);
}
