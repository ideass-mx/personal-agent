import { HitlModal } from "./components/HitlModal";
import { Shell } from "./components/Shell";
import { CompanionHost } from "./features/companion/CompanionHost";
import { DiagnosticsScreen } from "./features/diagnostics/DiagnosticsScreen";
import { ExperienceLabScreen } from "./experience/ExperienceLabScreen";
import { SettingsScreen } from "./features/configuration/SettingsScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { OnboardingWizard } from "./features/setup/OnboardingWizard";
import { ProfileNameScreen } from "./features/setup/ProfileNameScreen";
import { resolveProductSurfaceGate } from "./features/setup/setup-flow";
import { useApp } from "./state/AppContext";
import { useEffect, useState } from "react";
import { resolveHttpBase } from "./api/http";
import { fetchSetupStatus } from "./api/setup";
import { fetchIdentityMe } from "./api/identity";

function Routed() {
  const { nav, session, health, healthError, wsStatus, setNav, setUserDisplayName } =
    useApp();
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [profileDone, setProfileDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session) {
      setSetupDone(null);
      setProfileDone(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const base = resolveHttpBase(session);
      try {
        const me = await fetchIdentityMe(base, session.token);
        if (!cancelled) {
          setUserDisplayName(me.user.name);
          setProfileDone(Boolean(me.user.profileCompleted));
        }
      } catch {
        if (!cancelled) {
          // Fail closed: sin perfil confirmado no saltar el nombre.
          setProfileDone(false);
        }
      }
      try {
        const st = await fetchSetupStatus(base, session.token);
        if (!cancelled) {
          setSetupDone(Boolean(st.llmConfigured));
        }
      } catch {
        if (!cancelled) setSetupDone(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, setUserDisplayName]);

  if (!session) {
    return <SetupScreen mode="welcome" />;
  }

  if (setupDone === null || profileDone === null) {
    return (
      <div className="setup-center">
        <div className="panel">
          <h1>Conectando…</h1>
          <p className="lead">Preparando tu espacio.</p>
        </div>
      </div>
    );
  }

  // PROFILE → LLM → Conversation. READY sin nombre no salta el perfil.
  const surface = resolveProductSurfaceGate({
    profileConfigured: profileDone,
    llmConfigured: setupDone,
  });
  if (surface === "profile") {
    return (
      <ProfileNameScreen
        onCompleted={() => {
          setProfileDone(true);
        }}
      />
    );
  }

  if (surface === "llm") {
    return (
      <OnboardingWizard
        initialStep="llm_intro"
        onCompleted={() => {
          void (async () => {
            try {
              const base = resolveHttpBase(session);
              const st = await fetchSetupStatus(base, session.token);
              if (!st.llmConfigured) {
                setSetupDone(false);
                return;
              }
              setSetupDone(true);
              setNav("conversation");
            } catch {
              setSetupDone(false);
            }
          })();
        }}
      />
    );
  }

  const hostUnreachable = Boolean(healthError) || wsStatus === "error";
  const showNotReadyGate =
    hostUnreachable &&
    nav !== "diagnostics" &&
    nav !== "settings" &&
    nav !== "experience";

  if (wsStatus === "connecting" && !health && !healthError) {
    return (
      <Shell>
        <div className="panel" style={{ margin: 24 }}>
          <h1>Conectando…</h1>
          <p className="lead">Contactando al Agent Host.</p>
        </div>
      </Shell>
    );
  }

  const body = showNotReadyGate ? (
    <SetupScreen mode="not_ready" />
  ) : (
    (() => {
      switch (nav) {
        case "conversation":
        case "conversations":
        case "projects":
        case "tasks":
        case "memory":
        case "files":
        case "activity":
        case "automations":
        case "library":
          return <CompanionHost />;
        case "settings":
          return <SettingsScreen />;
        case "diagnostics":
          return (
            <div className="screen">
              <DiagnosticsScreen />
            </div>
          );
        case "experience":
          return <ExperienceLabScreen />;
        default:
          return <CompanionHost />;
      }
    })()
  );

  return (
    <Shell>
      {body}
      <HitlModal />
    </Shell>
  );
}

export function App() {
  return <Routed />;
}
