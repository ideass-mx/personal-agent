/**
 * Helpers puros del flujo de onboarding (testables sin React).
 */
import type { SetupStatusDto } from "../../types";

export type OnboardingStep =
  | "welcome"
  | "preparing"
  | "agent_ready"
  | "llm_intro"
  | "llm_key"
  | "verifying"
  | "optional_android"
  | "optional_remote"
  | "done"
  | "error";

export type SetupProviderInfo = {
  id: string;
  name: string;
  available: boolean;
};

export function stepFromStatus(s: SetupStatusDto): OnboardingStep {
  if (s.onboardingCompleted || s.state === "READY") return "done";
  if (s.state === "VERIFIED") return "done";
  if (s.state === "VERIFYING" || s.state === "VERIFICATION_ERROR") return "verifying";
  if (s.state === "LLM_CONNECTED") return "verifying";
  if (
    s.state === "LLM_REQUIRED" ||
    s.state === "LLM_CONFIGURATION_ERROR" ||
    s.state === "ONBOARDING"
  ) {
    return "llm_intro";
  }
  if (s.state === "AGENT_READY" || s.installationReady) return "agent_ready";
  return "preparing";
}

export function isProviderSelectable(p: SetupProviderInfo): boolean {
  return p.available === true;
}

export function providerComingSoonLabel(p: SetupProviderInfo): string {
  if (p.available) return "Disponible";
  return "Próximamente";
}

/** Evita filtrar secretos a la UI (nunca renderizar claves). */
export function responseLooksLikeSecretLeak(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.includes("sk-ant-") && !lower.includes("sk-ant-pending")) return true;
  if (/"credential"\s*:/.test(lower)) return true;
  if (/"apiKey"\s*:/.test(lower) || /"api_key"\s*:/.test(lower)) return true;
  return false;
}
