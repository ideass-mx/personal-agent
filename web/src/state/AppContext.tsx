import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createConversation,
  fetchHealth,
  fetchMessages,
  listConversations,
  resolveHttpBase,
} from "../api/http";
import { HubSocket, type ServerMsg } from "../websocket/HubSocket";
import {
  clearSession,
  ensureDeviceId,
  loadSession,
  saveSession,
} from "./session";
import type {
  ChatMessage,
  ConfirmPending,
  ConnectionConfig,
  ConversationMeta,
  DiagnosticInfo,
  HealthSnapshot,
  NavId,
  SettingsSectionId,
} from "../types";
import { HITL_TIMEOUT_MS } from "../lib/toolActivity";
import { humanizeError } from "../lib/sanitize";

type WsStatus = "disconnected" | "connecting" | "authenticated" | "error";

type AppState = {
  session: ConnectionConfig | null;
  nav: NavId;
  setNav: (n: NavId) => void;
  settingsSection: SettingsSectionId;
  setSettingsSection: (s: SettingsSectionId) => void;
  openSettings: (section?: SettingsSectionId) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
  health: HealthSnapshot | null;
  healthError: string | null;
  refreshHealth: () => Promise<void>;
  wsStatus: WsStatus;
  connect: (cfg: ConnectionConfig) => Promise<void>;
  disconnect: () => void;
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  send: () => void;
  pendingConfirm: ConfirmPending | null;
  respondConfirm: (approved: boolean) => void;
  toolBanner: string | null;
  busy: boolean;
  bannerError: string | null;
  bannerDiagnostic: DiagnosticInfo | null;
};

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

function uid(): string {
  return crypto.randomUUID?.() ?? `m_${Date.now()}_${Math.random()}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ConnectionConfig | null>(() =>
    loadSession(),
  );
  const [nav, setNav] = useState<NavId>("agent");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("profile");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingConfirm, setPending] = useState<ConfirmPending | null>(null);
  const [toolBanner, setToolBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerDiagnostic, setBannerDiagnostic] =
    useState<DiagnosticInfo | null>(null);
  const socketRef = useRef<HubSocket | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeConversationId;

  const refreshHealth = useCallback(async () => {
    if (!session) {
      setHealth(null);
      return;
    }
    try {
      const base = resolveHttpBase(session);
      const h = await fetchHealth(base);
      setHealth(h);
      setHealthError(null);
    } catch {
      setHealth(null);
      setHealthError("agent_unavailable");
    }
  }, [session]);

  const refreshConversations = useCallback(async () => {
    if (!session) return;
    try {
      const base = resolveHttpBase(session);
      const list = await listConversations(base, session.token);
      setConversations((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const c of list) map.set(c.id, c);
        return [...map.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
      });
    } catch {
      /* keep local */
    }
  }, [session]);

  const handleServer = useCallback((msg: ServerMsg) => {
    if (msg.type === "assistant_chunk") {
      const cid = msg.conversationId ?? activeRef.current;
      if (cid && activeRef.current && cid !== activeRef.current) return;
      setBusy(true);
      setToolBanner(null);
      setMessages((prev) => {
        const sid = streamIdRef.current;
        if (sid) {
          return prev.map((m) =>
            m.id === sid ? { ...m, text: m.text + msg.text } : m,
          );
        }
        const id = uid();
        streamIdRef.current = id;
        return [
          ...prev,
          { id, role: "assistant", text: msg.text, streaming: true },
        ];
      });
      if (msg.conversationId) {
        setActive((cur) => cur ?? msg.conversationId!);
        setConversations((prev) => {
          if (prev.some((c) => c.id === msg.conversationId)) return prev;
          return [
            {
              id: msg.conversationId!,
              title: null,
              createdAt: new Date().toISOString(),
              workspaceId: null,
            },
            ...prev,
          ];
        });
      }
    } else if (msg.type === "assistant_done") {
      streamIdRef.current = null;
      setBusy(false);
      setToolBanner("Acción completada");
      setActive(msg.conversationId);
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      );
      setConversations((prev) => {
        if (prev.some((c) => c.id === msg.conversationId)) return prev;
        return [
          {
            id: msg.conversationId,
            title: null,
            createdAt: new Date().toISOString(),
            workspaceId: null,
          },
          ...prev,
        ];
      });
      setTimeout(() => setToolBanner(null), 2500);
    } else if (msg.type === "confirm_request") {
      setPending({
        confirmationId: msg.confirmationId,
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        input: msg.input,
        conversationId: msg.conversationId,
        receivedAtMs: Date.now(),
      });
      setToolBanner("Esperando autorización…");
    } else if (msg.type === "error") {
      setBusy(false);
      streamIdRef.current = null;
      const text = humanizeError(msg.code, msg.message);
      setBannerError(text);
      setBannerDiagnostic(msg.diagnostic ?? null);
      if (
        !msg.conversationId ||
        msg.conversationId === activeRef.current ||
        !activeRef.current
      ) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "system", text },
        ]);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setWsStatus("disconnected");
    setPending(null);
  }, []);

  const connect = useCallback(
    async (cfg: ConnectionConfig) => {
      const normalized: ConnectionConfig = {
        ...cfg,
        deviceId: ensureDeviceId(cfg.deviceId),
        deviceName: cfg.deviceName || "Agent Console",
        httpBase: (cfg.httpBase || "").replace(/\/$/, ""),
      };
      saveSession(normalized);
      setSession(normalized);
      disconnect();
      setWsStatus("connecting");
      setBannerError(null);
      const base = resolveHttpBase(normalized);
      try {
        const h = await fetchHealth(base);
        setHealth(h);
      } catch {
        setHealthError("agent_unavailable");
      }
      const url = (() => {
        if (!normalized.httpBase) {
          const proto = location.protocol === "https:" ? "wss:" : "ws:";
          return `${proto}//${location.host}/ws`;
        }
        const u = new URL(normalized.httpBase);
        u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
        u.pathname = "/ws";
        return u.toString();
      })();
      const sock = new HubSocket(
        url,
        normalized.token,
        normalized.deviceId,
        normalized.deviceName,
        {
          onAuthOk: () => setWsStatus("authenticated"),
          onClose: () => {
            setWsStatus("disconnected");
            setPending(null);
          },
          onError: () => setWsStatus("error"),
          onMessage: handleServer,
        },
      );
      socketRef.current = sock;
      sock.connect();
      setNav("agent");
    },
    [disconnect, handleServer],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const openSettings = useCallback((section: SettingsSectionId = "profile") => {
    setSettingsSection(section);
    setNav("settings");
    setAccountMenuOpen(false);
  }, []);

  useEffect(() => {
    if (session) {
      void connect(session);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once from stored session
  }, []);

  useEffect(() => {
    if (!pendingConfirm) return;
    const t = window.setInterval(() => {
      const left =
        pendingConfirm.receivedAtMs + HITL_TIMEOUT_MS - Date.now();
      if (left <= 0) {
        setPending(null);
        setToolBanner("Autorización expirada");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pendingConfirm]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (!session) return;
      setActive(id);
      setNav("conversation");
      setBannerError(null);
      try {
        const base = resolveHttpBase(session);
        const rows = await fetchMessages(base, session.token, id);
        setMessages(
          rows
            .filter((r) => r.role === "user" || r.role === "assistant")
            .map((r) => ({
              id: r.id,
              role: r.role as "user" | "assistant",
              text: r.content,
            })),
        );
      } catch {
        setMessages([]);
      }
    },
    [session],
  );

  const newConversation = useCallback(async () => {
    if (!session) return;
    try {
      const base = resolveHttpBase(session);
      const created = await createConversation(base, session.token);
      setConversations((prev) => [created, ...prev]);
      setActive(created.id);
      setMessages([]);
      setNav("conversation");
    } catch {
      setActive(null);
      setMessages([]);
      setNav("conversation");
    }
  }, [session]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    setDraft("");
    setBannerError(null);
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text },
    ]);
    setBusy(true);
    setToolBanner("Preparando acción…");
    try {
      socketRef.current.sendUserMessage(
        text,
        activeConversationId ?? undefined,
      );
    } catch {
      setBusy(false);
      setBannerError("No hay conexión con el Agent Host.");
      setToolBanner(null);
    }
  }, [draft, activeConversationId]);

  const respondConfirm = useCallback((approved: boolean) => {
    const p = pendingConfirm;
    if (!p || !socketRef.current) return;
    try {
      socketRef.current.sendConfirm(p.confirmationId, approved);
    } catch {
      setBannerError("No se pudo enviar la respuesta de autorización.");
    }
    setPending(null);
    setToolBanner(approved ? "Ejecutando…" : "Acción rechazada");
  }, [pendingConfirm]);

  useEffect(() => {
    if (session && wsStatus === "authenticated") {
      void refreshConversations();
      void refreshHealth();
    }
  }, [session, wsStatus, refreshConversations, refreshHealth]);

  const value = useMemo<AppState>(
    () => ({
      session,
      nav,
      setNav,
      settingsSection,
      setSettingsSection,
      openSettings,
      sidebarCollapsed,
      toggleSidebar,
      accountMenuOpen,
      setAccountMenuOpen,
      health,
      healthError,
      refreshHealth,
      wsStatus,
      connect,
      disconnect: () => {
        disconnect();
        clearSession();
        setSession(null);
        setAccountMenuOpen(false);
      },
      conversations,
      activeConversationId,
      messages,
      draft,
      setDraft,
      selectConversation,
      newConversation,
      refreshConversations,
      send,
      pendingConfirm,
      respondConfirm,
      toolBanner,
      busy,
      bannerError,
      bannerDiagnostic,
    }),
    [
      session,
      nav,
      settingsSection,
      openSettings,
      sidebarCollapsed,
      toggleSidebar,
      accountMenuOpen,
      health,
      healthError,
      refreshHealth,
      wsStatus,
      connect,
      disconnect,
      conversations,
      activeConversationId,
      messages,
      draft,
      selectConversation,
      newConversation,
      refreshConversations,
      send,
      pendingConfirm,
      respondConfirm,
      toolBanner,
      busy,
      bannerError,
      bannerDiagnostic,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
