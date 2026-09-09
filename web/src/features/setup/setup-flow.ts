/**
 * Helpers puros del flujo de onboarding (testables sin React).
 * PROFILE y LLM CONFIGURATION son estados independientes.
 */
import type { SetupStatusDto } from "../../types";

export type OnboardingStep =
  | "welcome"
  | "preparing"
  | "agent_ready"
  | "hardware"
  | "local_recommend"
  | "local_installing"
  | "llm_intro"
  | "llm_key"
  | "cloud_connecting"
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

/** Post-session surface after Welcome/pairing. READY alone is never enough. */
export type ProductSurfaceGate = "profile" | "llm" | "conversation";

/**
 * Onboarding sólo termina cuando perfil y LLM están configurados.
 * READY sin nombre → PROFILE; nombre sin LLM → LLM.
 */
export function resolveProductSurfaceGate(input: {
  profileConfigured: boolean;
  llmConfigured: boolean;
}): ProductSurfaceGate {
  if (!input.profileConfigured) return "profile";
  if (!input.llmConfigured) return "llm";
  return "conversation";
}

/** LLM setup is complete only when a real credential exists. */
export function isLlmConfigured(s: Pick<SetupStatusDto, "llmConfigured">): boolean {
  return Boolean(s.llmConfigured);
}

/**
 * Application ready for chat requires LLM configured.
 * Profile is gated separately in App.tsx.
 * Con provider=local esto implica Qwen3 4B instalado (isLocalLlmConfigured).
 */
export function isApplicationReadyForChat(
  s: Pick<SetupStatusDto, "llmConfigured" | "onboardingCompleted" | "state">,
): boolean {
  return isLlmConfigured(s);
}

/**
 * PHASE 61.2.0 / 62 — no se permite llegar al chat sin inteligencia.
 * El usuario elige Local, Cloud o Mi proveedor; Local implica instalar modelo.
 */
export function allowsSkipLocalModelToChat(): boolean {
  return false;
}

/**
 * Derive wizard step from setup status.
 * NEVER treat SQLite READY as done if llmConfigured is false
 * (stale state after uninstall/key purge).
 *
 * Sin LLM → elegir modo (Local / Cloud / BYOK). La instalación local
 * solo ocurre si el usuario elige Local.
 */
export function stepFromStatus(s: SetupStatusDto): OnboardingStep {
  if (isLlmConfigured(s) && (s.onboardingCompleted || s.state === "READY" || s.state === "VERIFIED")) {
    return "done";
  }
  // Stale READY / VERIFIED without a real key → force LLM configuration.
  if (
    !isLlmConfigured(s) &&
    (s.state === "READY" ||
      s.state === "VERIFIED" ||
      s.state === "LLM_CONNECTED" ||
      s.onboardingCompleted)
  ) {
    return "llm_intro";
  }
  if (s.state === "VERIFYING" || s.state === "VERIFICATION_ERROR") return "verifying";
  if (s.state === "LLM_CONNECTED" && isLlmConfigured(s)) return "verifying";
  if (
    s.state === "LLM_REQUIRED" ||
    s.state === "LLM_CONFIGURATION_ERROR" ||
    s.state === "ONBOARDING"
  ) {
    return "llm_intro";
  }
  // Instalación lista ≠ producto listo: falta elegir / conectar inteligencia.
  if (s.state === "AGENT_READY" || s.installationReady) return "llm_intro";
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

/** Display plan label (local stub until billing exists). */
export const USER_PLAN_LABEL = "Plan Personal";
