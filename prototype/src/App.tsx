import { CreateProjectModal } from "./components/CreateProjectModal";
import { Sidebar } from "./components/Sidebar";
import { AgentSpaceScreen } from "./screens/AgentSpaceScreen";
import { AutomationsScreen } from "./screens/AutomationsScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { ProjectsListScreen } from "./screens/ProjectsListScreen";
import { ProjectSpaceScreen } from "./screens/ProjectSpaceScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { AppProvider, useApp } from "./state/AppState";

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { sidebarCollapsed, nav } = useApp();

  return (
    <div className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar />
      <main className="work-area">
        {nav.screen === "agent" ? <AgentSpaceScreen /> : null}
        {nav.screen === "conversation" ? <ConversationScreen /> : null}
        {nav.screen === "projects" ? <ProjectsListScreen /> : null}
        {nav.screen === "project" ? <ProjectSpaceScreen /> : null}
        {nav.screen === "tasks" ? <TasksScreen /> : null}
        {nav.screen === "automations" ? <AutomationsScreen /> : null}
        {nav.screen === "library" ? <LibraryScreen /> : null}
        {nav.screen === "settings" ? <SettingsScreen /> : null}
      </main>
      <CreateProjectModal />
    </div>
  );
}
