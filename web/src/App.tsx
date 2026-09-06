import { HitlModal } from "./components/HitlModal";
import { Shell } from "./components/Shell";
import { AgentSpaceScreen } from "./features/agent/AgentSpaceScreen";
import { AutomationsScreen } from "./features/automations/AutomationsScreen";
import { ConversationScreen } from "./features/conversations/ConversationThreadScreen";
import { ConversationsListScreen } from "./features/conversations/ConversationsListScreen";
import { DiagnosticsScreen } from "./features/diagnostics/DiagnosticsScreen";
import { LibraryScreen } from "./features/library/LibraryScreen";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { SettingsScreen } from "./features/configuration/SettingsScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { OnboardingWizard } from "./features/setup/OnboardingWizard";
import { TasksScreen } from "./features/tasks/TasksScreen";
import { useApp } from "./state/AppContext";
import { useEffect, useState } from "react";
import { resolveHttpBase } from "./api/http";
import { fetchSetupStatus } from "./api/setup";

function Routed() {
  const { nav, session, health, healthError, wsStatus, setNav } = useApp();
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session) {
      setSetupDone(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const base = resolveHttpBase(session);
        const st = await fetchSetupStatus(base, session.token);
        if (!cancelled) {
          setSetupDone(Boolean(st.onboardingCompleted || st.state === "READY"));
        }
      } catch {
        if (!cancelled) setSetupDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return <SetupScreen mode="welcome" />;
  }

  if (setupDone === null) {
    return (
      <div className="setup-center">
        <div className="panel">
          <h1>Conectando…</h1>
          <p className="lead">Preparando tu espacio.</p>
        </div>
      </div>
    );
  }

  if (setupDone === false) {
    return (
      <OnboardingWizard
        onCompleted={() => {
          setSetupDone(true);
          setNav("agent");
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
        case "agent":
          return <AgentSpaceScreen />;
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
          return <AgentSpaceScreen />;
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
