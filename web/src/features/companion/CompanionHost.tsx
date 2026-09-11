/**
 * Host de pantallas companion (un chat · muchos espacios).
 */
import { useCompanion } from "./CompanionContext";
import { AskCompanionFab } from "./components/AskCompanionFab";
import { CommandPalette } from "./components/CommandPalette";
import { ToastLayer } from "./components/ToastLayer";
import { CompanionActivityScreen } from "./CompanionActivityScreen";
import { CompanionFilesScreen } from "./CompanionFilesScreen";
import { CompanionMemoryScreen } from "./CompanionMemoryScreen";
import { CompanionProjectsScreen } from "./CompanionProjectsScreen";
import { CompanionTasksScreen } from "./CompanionTasksScreen";
import { MainChatScreen } from "./MainChatScreen";
import { ProjectCreateScreen } from "./ProjectCreateScreen";
import { WorkspaceScreen } from "./WorkspaceScreen";

export function CompanionHost() {
  const { companionNav } = useCompanion();

  let body;
  switch (companionNav) {
    case "chat":
      body = <MainChatScreen />;
      break;
    case "projects":
      body = <CompanionProjectsScreen />;
      break;
    case "create-project":
      body = <ProjectCreateScreen />;
      break;
    case "workspace":
      body = <WorkspaceScreen />;
      break;
    case "tasks":
      body = <CompanionTasksScreen />;
      break;
    case "memory":
      body = <CompanionMemoryScreen />;
      break;
    case "files":
      body = <CompanionFilesScreen />;
      break;
    case "activity":
      body = <CompanionActivityScreen />;
      break;
    default:
      body = <MainChatScreen />;
  }

  return (
    <div className="companion-root">
      {body}
      <ToastLayer />
      <CommandPalette />
      <AskCompanionFab />
    </div>
  );
}
