import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import type { NavId } from "../types";
import { ConversationSidebarList } from "../features/conversations/ConversationSidebarList";
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
  IconPlusCircle,
  IconSearch,
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
    newConversation,
    session,
    userDisplayName,
  } = useApp();

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

  const isActive = (id: NavId) => nav === id;
  const showConnWarning =
    wsStatus === "error" ||
    health === null ||
    health?.ok === false ||
    wsStatus === "connecting";

  return (
    <div className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => setNav("conversation")}
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
            <button type="button" className="icon-btn" title="Buscar" aria-label="Buscar">
              <IconSearch />
            </button>
          </div>
        </div>

        <div className="sidebar-scroll">
          <button
            type="button"
            className="nav-item new-chat"
            onClick={() => void newConversation()}
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
              onClick={() => setNav("tasks")}
              icon={<IconCheckSquare />}
            />
            <NavBtn
              active={isActive("automations")}
              title="Automatizaciones"
              collapsed={sidebarCollapsed}
              onClick={() => setNav("automations")}
              icon={<IconZap />}
            />
            <NavBtn
              active={isActive("library")}
              title="Biblioteca"
              collapsed={sidebarCollapsed}
              onClick={() => setNav("library")}
              icon={<IconBook />}
            />
            <NavBtn
              active={isActive("experience")}
              title="Experiencia"
              collapsed={sidebarCollapsed}
              onClick={() => setNav("experience")}
              icon={<IconZap />}
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
                  onClick={() => setNav("projects")}
                >
                  <IconArchive size={16} />
                </button>
              </div>
            </div>
            {sidebarCollapsed ? (
              <NavBtn
                active={isActive("projects")}
                title="Proyectos"
                collapsed
                onClick={() => setNav("projects")}
                icon={<IconFolder />}
              />
            ) : (
              <button
                type="button"
                className={`nav-item listed ${isActive("projects") ? "active" : ""}`}
                onClick={() => setNav("projects")}
              >
                <span className="truncate">Ver proyectos</span>
              </button>
            )}
          </div>

          <div className="nav-section">
            <div className="section-head">
              {!sidebarCollapsed ? <span>Conversaciones</span> : null}
            </div>
            {sidebarCollapsed ? (
              <NavBtn
                active={nav === "conversation" || nav === "conversations"}
                title="Conversaciones"
                collapsed
                onClick={() => setNav("conversations")}
                icon={<IconMessage />}
              />
            ) : (
              <ConversationSidebarList />
            )}
          </div>
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
                <span className="muted account-plan">Plan Personal</span>
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
                  <IconSettings size={16} /> Configuración
                </button>
                <button type="button" role="menuitem" onClick={() => openSettings("system")}>
                  <IconCreditCard size={16} /> Plan · Uso
                </button>
                <button type="button" role="menuitem" onClick={() => openSettings("appearance")}>
                  <IconMoon size={16} /> Tema
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

function NavBtn(props: {
  active: boolean;
  title: string;
  collapsed: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${props.active ? "active" : ""}`}
      onClick={props.onClick}
      title={props.title}
    >
      {props.icon}
      {!props.collapsed ? <span>{props.title}</span> : null}
    </button>
  );
}
