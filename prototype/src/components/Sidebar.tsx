import type { ReactNode } from "react";
import {
  IconArchive,
  IconBook,
  IconCheckSquare,
  IconCreditCard,
  IconFolder,
  IconLogOut,
  IconMessage,
  IconMoon,
  IconPanelLeft,
  IconPlus,
  IconPlusCircle,
  IconSearch,
  IconSettings,
  IconZap,
} from "./icons";
import { useApp } from "../state/AppState";

export function Sidebar() {
  const {
    account,
    sidebarCollapsed,
    toggleSidebar,
    accountMenuOpen,
    setAccountMenuOpen,
    setCreateProjectOpen,
    nav,
    setNav,
    projects,
    conversations,
    startBlankConversation,
    openConversation,
    openProject,
    openSettings,
  } = useApp();

  const isActive = (kind: string, id?: string) => {
    if (kind === "tasks") return nav.screen === "tasks";
    if (kind === "automations") return nav.screen === "automations";
    if (kind === "library") return nav.screen === "library";
    if (kind === "projects") return nav.screen === "projects";
    if (kind === "project") return nav.screen === "project" && nav.projectId === id;
    if (kind === "conversation")
      return nav.screen === "conversation" && nav.conversationId === id;
    if (kind === "agent") return nav.screen === "agent";
    return false;
  };

  return (
    <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        <button
          type="button"
          className="brand"
          onClick={() =>
            setNav({ screen: "agent", capability: "research", mode: "idle" })
          }
          title="Personal Agent"
        >
          <span className="brand-mark" aria-hidden />
          {!sidebarCollapsed ? <span className="brand-text">Personal Agent</span> : null}
        </button>
        <div className="sidebar-tools">
          <button
            type="button"
            className="icon-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir" : "Colapsar"}
            aria-label={sidebarCollapsed ? "Expandir barra" : "Colapsar barra"}
          >
            <IconPanelLeft />
          </button>
          {!sidebarCollapsed ? (
            <button type="button" className="icon-btn" title="Buscar" aria-label="Buscar">
              <IconSearch />
            </button>
          ) : (
            <button type="button" className="icon-btn" title="Buscar" aria-label="Buscar">
              <IconSearch />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-scroll">
        <button
          type="button"
          className="nav-item new-chat"
          onClick={startBlankConversation}
          title="Nuevo"
        >
          <IconPlusCircle />
          {!sidebarCollapsed ? <span>Nuevo</span> : null}
        </button>

        <nav className="nav-section">
          <NavBtn
            active={isActive("tasks")}
            title="Tareas"
            collapsed={sidebarCollapsed}
            onClick={() => setNav({ screen: "tasks" })}
            icon={<IconCheckSquare />}
          />
          <NavBtn
            active={isActive("automations")}
            title="Automatizaciones"
            collapsed={sidebarCollapsed}
            onClick={() => setNav({ screen: "automations" })}
            icon={<IconZap />}
          />
          <NavBtn
            active={isActive("library")}
            title="Biblioteca"
            collapsed={sidebarCollapsed}
            onClick={() => setNav({ screen: "library" })}
            icon={<IconBook />}
          />
        </nav>

        <div className="nav-section">
          <div className="section-head">
            {!sidebarCollapsed ? <span>Proyectos</span> : null}
            <div className="section-actions">
              <button
                type="button"
                className="icon-btn sm"
                title="Ver todos"
                aria-label="Ver todos los proyectos"
                onClick={() => setNav({ screen: "projects" })}
              >
                <IconArchive size={16} />
              </button>
              <button
                type="button"
                className="icon-btn sm"
                title="Nuevo proyecto"
                aria-label="Nuevo proyecto"
                onClick={() => setCreateProjectOpen(true)}
              >
                <IconPlus size={16} />
              </button>
            </div>
          </div>
          {sidebarCollapsed ? (
            <NavBtn
              active={nav.screen === "projects" || nav.screen === "project"}
              title="Proyectos"
              collapsed
              onClick={() => setNav({ screen: "projects" })}
              icon={<IconFolder />}
            />
          ) : (
            <ol className="project-list">
              {projects.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`nav-item listed ${isActive("project", p.id) ? "active" : ""}`}
                    onClick={() => openProject(p.id)}
                    title={p.name}
                  >
                    <span className="list-index">{idx + 1}</span>
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="nav-section">
          <div className="section-head">
            {!sidebarCollapsed ? <span>Conversaciones</span> : null}
          </div>
          {sidebarCollapsed ? (
            <NavBtn
              active={nav.screen === "conversation" || nav.screen === "conversations"}
              title="Conversaciones"
              collapsed
              onClick={() => {
                const first = conversations[0];
                if (first) openConversation(first.id);
                else setNav({ screen: "conversations" });
              }}
              icon={<IconMessage />}
            />
          ) : (
            <ul className="conv-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`nav-item listed ${isActive("conversation", c.id) ? "active" : ""}`}
                    onClick={() => openConversation(c.id)}
                    title={c.title}
                  >
                    <span className="truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className={`account-btn ${accountMenuOpen ? "open" : ""}`}
          onClick={() => setAccountMenuOpen(!accountMenuOpen)}
          title={account.name}
        >
          <span className="avatar">{account.initials}</span>
          {!sidebarCollapsed ? (
            <span className="account-meta">
              <strong className="truncate">{account.name}</strong>
              <span className="muted">{account.plan}</span>
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
              <div className="account-menu-head">{account.email}</div>
              <button type="button" role="menuitem" onClick={() => openSettings("profile")}>
                <IconSettings size={16} /> Configuración
              </button>
              <button type="button" role="menuitem" onClick={() => openSettings("system")}>
                <IconCreditCard size={16} /> Plan · Uso
              </button>
              <button type="button" role="menuitem" onClick={() => openSettings("appearance")}>
                <IconMoon size={16} /> Tema
              </button>
              <button type="button" role="menuitem" className="danger">
                <IconLogOut size={16} /> Cerrar sesión
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function NavBtn({
  active,
  title,
  collapsed,
  onClick,
  icon,
}: {
  active: boolean;
  title: string;
  collapsed: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      title={title}
    >
      {icon}
      {!collapsed ? <span>{title}</span> : null}
    </button>
  );
}
