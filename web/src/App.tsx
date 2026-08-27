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
import { WorkspaceScreen } from "./features/workspace/WorkspaceScreen";
import { useApp } from "./state/AppContext";

function Routed() {
  const { nav, session, health, healthError, wsStatus } = useApp();

  if (!session) {
    return <SetupScreen mode="welcome" />;
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
