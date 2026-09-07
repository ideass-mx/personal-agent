import { HitlModal } from "./components/HitlModal";
import { Shell } from "./components/Shell";
import { AutomationsScreen } from "./features/automations/AutomationsScreen";
import { ConversationScreen } from "./features/conversations/ConversationThreadScreen";
import { ConversationsListScreen } from "./features/conversations/ConversationsListScreen";
import { DiagnosticsScreen } from "./features/diagnostics/DiagnosticsScreen";
import { LibraryScreen } from "./features/library/LibraryScreen";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { SettingsScreen } from "./features/configuration/SettingsScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { OnboardingWizard } from "./features/setup/OnboardingWizard";
import { ProfileNameScreen } from "./features/setup/ProfileNameScreen";
import { TasksScreen } from "./features/tasks/TasksScreen";
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
          // Fail open for profile only if identity API unavailable (legacy).
          setProfileDone(true);
        }
      }
      try {
        const st = await fetchSetupStatus(base, session.token);
        if (!cancelled) {
          // llmConfigured refleja clave real (uninstall puede borrar el token).
          setSetupDone(
            Boolean(
              st.llmConfigured &&
                (st.onboardingCompleted || st.state === "READY"),
            ),
          );
        }
      } catch {
        if (!cancelled) setSetupDone(true);
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

  // Nombre primero (PHASE 58), luego setup LLM existente.
  if (profileDone === false) {
    return (
      <ProfileNameScreen
        onCompleted={() => {
          setProfileDone(true);
        }}
      />
    );
  }

  if (setupDone === false) {
    return (
      <OnboardingWizard
        onCompleted={() => {
          setSetupDone(true);
          setNav("conversation");
        }}
      />
    );
  }

  const hostUnreachable = Boolean(healthError) || wsStatus === "error";
  const showNotReadyGate =
    hostUnreachable && nav !== "diagnostics" && nav !== "settings";

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
          return <ConversationScreen />;
        case "conversations":
          return <ConversationsListScreen />;
        case "projects":
          return <ProjectsScreen />;
        case "tasks":
          return <TasksScreen />;
        case "automations":
          return <AutomationsScreen />;
        case "library":
          return <LibraryScreen />;
        case "settings":
          return <SettingsScreen />;
        case "diagnostics":
          return (
            <div className="screen">
              <DiagnosticsScreen />
            </div>
          );
        default:
          return <ConversationScreen />;
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
