import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import type { NavId } from "../types";

const ITEMS: Array<{ id: NavId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "conversations", label: "Conversations" },
  { id: "capabilities", label: "Capabilities" },
  { id: "workspace", label: "Workspace" },
  { id: "connections", label: "Connections" },
  { id: "settings", label: "Settings" },
  { id: "diagnostics", label: "Diagnostics" },
];

function statusBadge(
  wsStatus: string,
  healthOk: boolean | null,
  agentReady: boolean,
): { text: string; cls: string } {
  if (wsStatus === "authenticated" && healthOk && agentReady) {
    return { text: "AGENT READY", cls: "badge" };
  }
  if (wsStatus === "authenticated" && healthOk) {
    return { text: "CONNECTED", cls: "badge warn" };
  }
  if (wsStatus === "connecting") {
    return { text: "CONNECTING…", cls: "badge muted" };
  }
  if (wsStatus === "error" || healthOk === false) {
    return { text: "OFFLINE", cls: "badge err" };
  }
  return { text: "DISCONNECTED", cls: "badge muted" };
}

export function Shell({ children }: { children: ReactNode }) {
  const { nav, setNav, wsStatus, health, disconnect } = useApp();
  const badge = statusBadge(
    wsStatus,
    health ? health.ok : null,
    Boolean(health?.agentReady),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Personal Agent</div>
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-btn${nav === item.id ? " active" : ""}`}
            onClick={() => setNav(item.id)}
          >
            {item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" className="nav-btn" onClick={disconnect}>
          Disconnect
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="muted">Agent Console</div>
          <div className={badge.cls}>● {badge.text}</div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
