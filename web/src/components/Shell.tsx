import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import type { NavId } from "../types";
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

function statusBadge(
  wsStatus: string,
  healthOk: boolean | null,
  agentReady: boolean,
): { text: string; cls: string } {
  if (wsStatus === "authenticated" && healthOk && agentReady) {
    return { text: "Listo", cls: "badge" };
  }
  if (wsStatus === "authenticated" && healthOk) {
    return { text: "Conectado", cls: "badge warn" };
  }
  if (wsStatus === "connecting") {
    return { text: "Conectando…", cls: "badge muted" };
  }
  if (wsStatus === "error" || healthOk === false) {
    return { text: "Sin conexión", cls: "badge err" };
  }
  return { text: "Desconectado", cls: "badge muted" };
}

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
    conversations,
    selectConversation,
    newConversation,
    session,
    activeConversationId,
  } = useApp();

  const badge = statusBadge(
    wsStatus,
    health ? health.ok : null,
    Boolean(health?.agentReady),
  );

  const deviceLabel = session?.deviceName || "Consola";
  const initials = deviceLabel
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isActive = (id: NavId) => nav === id;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => setNav("agent")}
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
              <ul className="conv-list">
                {conversations.length === 0 ? (
                  <li className="muted" style={{ padding: "8px 10px", fontSize: 12.5 }}>
                    Sin conversaciones aún
                  </li>
                ) : (
                  conversations.slice(0, 12).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`nav-item listed ${
                          nav === "conversation" && activeConversationId === c.id
                            ? "active"
                            : ""
                        }`}
                        onClick={() => void selectConversation(c.id)}
                        title={c.title || c.id}
                      >
                        <span className="truncate">
                          {c.title || `Conversación ${c.id.slice(0, 8)}`}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="conn-badge-row">
            {!sidebarCollapsed ? <span className={badge.cls}>● {badge.text}</span> : null}
          </div>
          <button
            type="button"
            className={`account-btn ${accountMenuOpen ? "open" : ""}`}
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            title={deviceLabel}
          >
            <span className="avatar">{initials || "PA"}</span>
            {!sidebarCollapsed ? (
              <span className="account-meta">
                <strong className="truncate">{deviceLabel}</strong>
                <span className="muted">Personal Agent</span>
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
                <div className="account-menu-head">
                  {session?.deviceId ? `Dispositivo · ${session.deviceId.slice(0, 8)}…` : "Cuenta"}
                </div>
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
