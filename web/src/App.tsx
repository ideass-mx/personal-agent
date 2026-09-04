import { HitlModal } from "./components/HitlModal";
import { Shell } from "./components/Shell";
import { CapabilitiesScreen } from "./features/capabilities/CapabilitiesScreen";
import { ChatScreen } from "./features/chat/ChatScreen";
import { ConnectionsScreen } from "./features/connections/ConnectionsScreen";
import { ConversationsScreen } from "./features/conversations/ConversationsScreen";
import { DiagnosticsScreen } from "./features/diagnostics/DiagnosticsScreen";
import { OverviewScreen } from "./features/overview/OverviewScreen";
import { SettingsScreen } from "./features/configuration/SettingsScreen";
import { SetupScreen } from "./features/setup/SetupScreen";
import { OnboardingWizard } from "./features/setup/OnboardingWizard";
import { WorkspaceScreen } from "./features/workspace/WorkspaceScreen";
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
          if (st.onboardingCompleted || st.state === "READY") {
            /* stay on current nav */
          }
        }
      } catch {
        // Sin API de setup (Gateway antiguo): no bloquear consola clásica
        if (!cancelled) setSetupDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    // Host Electron inyecta sesión; remoto manual sigue usando SetupScreen.
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
          setNav("chat");
        }}
      />
    );
  }

  const hostUnreachable =
    Boolean(healthError) || wsStatus === "error";
  const showNotReadyGate =
    hostUnreachable && nav !== "diagnostics" && nav !== "settings";

  if (wsStatus === "connecting" && !health && !healthError) {
    return (
      <Shell>
        <div className="panel">
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
        case "overview":
          return <OverviewScreen />;
        case "chat":
          return <ChatScreen />;
        case "conversations":
          return <ConversationsScreen />;
        case "capabilities":
          return <CapabilitiesScreen />;
        case "workspace":
          return <WorkspaceScreen />;
        case "connections":
          return <ConnectionsScreen />;
        case "settings":
          return <SettingsScreen />;
        case "diagnostics":
          return <DiagnosticsScreen />;
        default:
          return <OverviewScreen />;
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
