import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import type { NavId } from "../types";
import { useCompanion } from "../features/companion/CompanionContext";
import { BellRouter } from "../features/companion/components/BellRouter";
import { NewProjectMenu } from "../features/projects/NewProjectMenu";
import type { MockProjectType } from "../features/projects/mockProjects";
import {
  IconActivity,
  IconBook,
  IconCheckSquare,
  IconCreditCard,
  IconFolder,
  IconLogOut,
  IconMessage,
  IconMoon,
  IconPanelLeft,
  IconSettings,
  IconZap,
} from "./icons";

export function Shell({ children }: { children: ReactNode }) {
  const {
    nav,
    setNav,
    wsStatus,
    health,
    disconnect,
    sidebarCollapsed,
    toggleSidebar,
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
    unreadMain,
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

  const showConnWarning =
    wsStatus === "error" ||
    health === null ||
    health?.ok === false ||
    wsStatus === "connecting";

  return (
    <div className={`app-shell companion-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => goCompanion("chat", "conversation")}
            title="Personal Agent"
          >
            <span className="brand-mark" aria-hidden />
            {!sidebarCollapsed ? <span className="brand-text">Agente</span> : null}
          </button>
          <div className="sidebar-tools">
            <BellRouter />
            <button
              type="button"
              className="icon-btn"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expandir" : "Colapsar"}
              aria-label={sidebarCollapsed ? "Expandir barra" : "Colapsar barra"}
            >
              <IconPanelLeft />
            </button>
          </div>
        </div>

        <div className="sidebar-scroll">
          {!sidebarCollapsed ? (
            <p className="section-head" style={{ marginBottom: 0 }}>
              <span>Agente</span>
            </p>
          ) : null}

          <nav className="nav-section" style={{ marginTop: 4 }}>
            <NavBtn
              active={chatActive}
              title="Chat"
              collapsed={sidebarCollapsed}
              badge={unreadMain ? "dot" : undefined}
              onClick={() => goCompanion("chat", "conversation")}
              icon={<IconMessage />}
            />
          </nav>

          <div className="nav-section">
            <div className="section-head">
              {!sidebarCollapsed ? <span>Projects</span> : null}
              <div className="section-actions">
                <NewProjectMenu
                  collapsed={sidebarCollapsed}
                  onSelect={onNewProjectType}
                />
              </div>
            </div>
            {sidebarCollapsed ? (
              <NavBtn
                active={projectsActive}
                title="Projects"
                collapsed
                onClick={() => goCompanion("projects", "projects")}
                icon={<IconFolder />}
              />
            ) : (
              <>
                <ul className="project-list mock-project-list">
                  {workspaces.slice(0, 8).map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className={`nav-item listed ${
                          activeWorkspaceId === w.id && companionNav === "workspace"
                            ? "active"
                            : ""
                        }`}
                        onClick={() => {
                          openWorkspace(w.id);
                          setNav("projects");
                        }}
                        title={w.name}
                      >
                        <span className="truncate">{w.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`nav-item listed ${
                    companionNav === "projects" ? "active" : ""
                  }`}
                  onClick={() => goCompanion("projects", "projects")}
                >
                  <span className="truncate">Ver todos</span>
                </button>
              </>
            )}
          </div>

          <nav className="nav-section">
            <NavBtn
              active={nav === "tasks" && companionNav === "tasks"}
              title="Tasks"
              collapsed={sidebarCollapsed}
              count={needsYou || undefined}
              onClick={() => goCompanion("tasks", "tasks")}
              icon={<IconCheckSquare />}
            />
            <NavBtn
              active={nav === "memory" && companionNav === "memory"}
              title="Memory"
              collapsed={sidebarCollapsed}
              onClick={() => goCompanion("memory", "memory")}
              icon={<IconBook />}
            />
            <NavBtn
              active={nav === "files" && companionNav === "files"}
              title="Files"
              collapsed={sidebarCollapsed}
              onClick={() => goCompanion("files", "files")}
              icon={<IconFolder />}
            />
            <NavBtn
              active={nav === "activity" && companionNav === "activity"}
              title="Activity"
              collapsed={sidebarCollapsed}
              onClick={() => goCompanion("activity", "activity")}
              icon={<IconActivity />}
            />
          </nav>

          {!sidebarCollapsed ? (
            <div className="nav-section">
              <button
                type="button"
                className={`nav-item listed ${isActive(nav, "experience") ? "active" : ""}`}
                onClick={() => setNav("experience")}
              >
                <IconZap />
                <span className="truncate">Lab (avanzado)</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="sidebar-foot">
          {showConnWarning && !sidebarCollapsed ? (
            <div className="conn-badge-row">
              <span className={wsStatus === "connecting" ? "badge muted" : "badge err"}>
                {wsStatus === "connecting" ? "Conectando…" : "Sin conexión"}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className={`account-btn ${accountMenuOpen ? "open" : ""}`}
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            title={displayName}
          >
            <span className="avatar">{initials || "PA"}</span>
            {!sidebarCollapsed ? (
              <span className="account-meta">
                <strong className="truncate account-name">{displayName}</strong>
                <span className="muted account-plan">Settings</span>
              </span>
            ) : null}
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
                  <IconCreditCard size={16} /> Sistema · Lab
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

function isActive(nav: NavId, id: NavId) {
  return nav === id;
}

function NavBtn(props: {
  active: boolean;
  title: string;
  collapsed: boolean;
  onClick: () => void;
  icon: ReactNode;
  badge?: "dot";
  count?: number;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${props.active ? "active" : ""}`}
      onClick={props.onClick}
      title={props.title}
    >
      <span className="nav-icon-wrap">
        {props.icon}
        {props.badge === "dot" ? <span className="cp-nav-dot" aria-hidden /> : null}
      </span>
      {!props.collapsed ? <span>{props.title}</span> : null}
      {!props.collapsed && props.count ? (
        <span className="cp-nav-count" aria-label={`${props.count} te necesitan`}>
          {props.count}
        </span>
      ) : null}
    </button>
  );
}
