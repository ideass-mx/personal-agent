import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import type { NavId } from "../types";
import { useCompanion } from "../features/companion/CompanionContext";
import { BellRouter } from "../features/companion/components/BellRouter";
import { NewProjectMenu } from "../features/projects/NewProjectMenu";
import type { MockProjectType } from "../features/projects/mockProjects";
import {
  IconRailActivity,
  IconRailChat,
  IconRailFiles,
  IconRailMemory,
  IconRailProjects,
  IconRailSettings,
  IconRailTasks,
} from "./railIcons";
import { IconCreditCard, IconLogOut, IconMoon, IconSettings } from "./icons";

export function Shell({ children }: { children: ReactNode }) {
  const {
    nav,
    setNav,
    wsStatus,
    health,
    disconnect,
    accountMenuOpen,
    setAccountMenuOpen,
    openSettings,
    session,
    userDisplayName,
  } = useApp();
  const {
    workspaces,
    activeWorkspaceId,
    companionNav,
    setCompanionNav,
    openWorkspace,
    startCreateProject,
    tasks,
  } = useCompanion();

  const needsYou = tasks.filter((t) => t.state === "needs-you").length;

  function goCompanion(
    next: "chat" | "projects" | "tasks" | "memory" | "files" | "activity",
    appNav: NavId,
  ) {
    setCompanionNav(next);
    setNav(appNav);
  }

  function onNewProjectType(type: MockProjectType) {
    const preset =
      type === "scientific_article"
        ? "Quiero crear un artículo científico"
        : type === "research"
          ? "Quiero investigar un tema a fondo"
          : type === "document"
            ? "Quiero crear un documento"
            : undefined;
    startCreateProject(preset);
    setNav("projects");
  }

  const displayName =
    userDisplayName?.trim() ||
    (session?.deviceName &&
    session.deviceName !== "Navegador" &&
    session.deviceName !== "Consola" &&
    session.deviceName !== "Agent Console"
      ? session.deviceName
      : null) ||
    "Tú";

  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const chatActive =
    (nav === "conversation" || nav === "conversations") &&
    companionNav === "chat";
  const projectsActive =
    nav === "projects" &&
    (companionNav === "projects" ||
      companionNav === "workspace" ||
      companionNav === "create-project");
  const inProjects = projectsActive;

  const showConnWarning =
    wsStatus === "error" ||
    health === null ||
    health?.ok === false ||
    wsStatus === "connecting";

  return (
    <div className="app-shell companion-shell">
      <aside className="rail" aria-label="Navegación">
        <div className="rail-top">
          <div className="brand brand-row">
            <button
              type="button"
              className="brand-hit"
              onClick={() => goCompanion("chat", "conversation")}
              title="Companion"
            >
              <span className="brand-mark" aria-hidden />
              <span className="brand-copy">
                <span className="brand-name">Companion</span>
                <span className="brand-sub">your agent</span>
              </span>
            </button>
            <BellRouter />
          </div>
        </div>

        <div className="nav-label">Agente</div>
        <nav className="nav">
          <NavItem
            active={chatActive}
            label="Chat"
            icon={<IconRailChat />}
            onClick={() => goCompanion("chat", "conversation")}
          />
          <NavItem
            active={projectsActive && companionNav !== "workspace"}
            label="Projects"
            icon={<IconRailProjects />}
            onClick={() => goCompanion("projects", "projects")}
            trailing={
              <span
                className="proj-add-wrap"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <NewProjectMenu onSelect={onNewProjectType} />
              </span>
            }
          />
          {inProjects ? (
            <ul className="proj-sublist">
              {workspaces.slice(0, 8).map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className={`proj-sub ${
                      activeWorkspaceId === w.id && companionNav === "workspace"
                        ? "on"
                        : ""
                    }`}
                    onClick={() => {
                      openWorkspace(w.id);
                      setNav("projects");
                    }}
                  >
                    <span className="proj-dot" aria-hidden />
                    <span className="truncate">{w.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>

        <nav className="nav" style={{ marginTop: 14 }}>
          <NavItem
            active={nav === "tasks" && companionNav === "tasks"}
            label="Tasks"
            icon={<IconRailTasks />}
            onClick={() => goCompanion("tasks", "tasks")}
            count={needsYou || undefined}
            countVariant="wait"
          />
          <NavItem
            active={nav === "memory" && companionNav === "memory"}
            label="Memory"
            icon={<IconRailMemory />}
            onClick={() => goCompanion("memory", "memory")}
          />
          <NavItem
            active={nav === "files" && companionNav === "files"}
            label="Files"
            icon={<IconRailFiles />}
            onClick={() => goCompanion("files", "files")}
          />
          <NavItem
            active={nav === "activity" && companionNav === "activity"}
            label="Activity"
            icon={<IconRailActivity />}
            onClick={() => goCompanion("activity", "activity")}
          />
        </nav>

        <div className="rail-spacer" />

        {showConnWarning ? (
          <p className="rail-conn muted">
            {wsStatus === "connecting" ? "Conectando…" : "Sin conexión"}
          </p>
        ) : null}

        <nav className="nav">
          <NavItem
            active={nav === "settings"}
            label="Settings"
            icon={<IconRailSettings />}
            onClick={() => openSettings("profile")}
          />
        </nav>

        <div className="rail-bottom">
          <button
            type="button"
            className={`profile ${accountMenuOpen ? "open" : ""}`}
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
          >
            <span className="avatar">{initials || "PA"}</span>
            <span className="profile-meta">
              <span className="profile-name truncate">{displayName}</span>
              <span className="profile-plan">Companion Pro</span>
            </span>
          </button>

          {accountMenuOpen ? (
            <>
              <button
                type="button"
                className="account-backdrop"
                aria-label="Cerrar menú"
                onClick={() => setAccountMenuOpen(false)}
              />
              <div className="account-menu" role="menu">
                <div className="account-menu-head">{displayName}</div>
                <button type="button" role="menuitem" onClick={() => openSettings("profile")}>
                  <IconSettings size={16} /> Settings
                </button>
                <button type="button" role="menuitem" onClick={() => openSettings("my-agent")}>
                  <IconSettings size={16} /> Comportamiento
                </button>
                <button type="button" role="menuitem" onClick={() => openSettings("system")}>
                  <IconCreditCard size={16} /> Sistema
                </button>
                <button type="button" role="menuitem" onClick={() => openSettings("appearance")}>
                  <IconMoon size={16} /> Apariencia
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    disconnect();
                  }}
                >
                  <IconLogOut size={16} /> Cerrar sesión
                </button>
              </div>
            </>
          ) : null}
        </div>
      </aside>

      <main className="work-area">{children}</main>
    </div>
  );
}

function NavItem(props: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  trailing?: ReactNode;
  count?: number;
  countVariant?: "wait";
}) {
  return (
    <button
      type="button"
      className={`nav-item ${props.active ? "on" : ""}`}
      onClick={props.onClick}
      title={props.label}
    >
      <span className="ico">{props.icon}</span>
      <span className="nav-label-text">{props.label}</span>
      {props.count != null && props.count > 0 ? (
        <span
          className={`nav-count ${props.countVariant === "wait" ? "wait" : ""}`}
        >
          {props.count}
        </span>
      ) : null}
      {props.trailing}
    </button>
  );
}
