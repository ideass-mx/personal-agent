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
  compareConversationsForSidebar,
  deleteConversation,
  fetchConversationIntelligence,
  fetchHealth,
  fetchMessages,
  listConversations,
  patchConversationPinned,
  putConversationIntelligence,
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
import {
  normalizeAgentSources,
  sanitizeAssistantDisplayText,
  type AgentSource,
} from "../sources";

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
  refreshConversations: () => Promise<ConversationMeta[] | null | undefined>;
  setConversationPinned: (id: string, pinned: boolean) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  send: () => void;
  pendingConfirm: ConfirmPending | null;
  respondConfirm: (approved: boolean) => void;
  toolBanner: string | null;
  busy: boolean;
  bannerError: string | null;
  bannerDiagnostic: DiagnosticInfo | null;
  /** Display name from users.name (never local-user / technical ids). */
  userDisplayName: string | null;
  setUserDisplayName: (name: string | null) => void;
  /** PHASE 60.15.1 — panel de fuentes del mensaje seleccionado. */
  sourcesPanelMessageId: string | null;
  openSourcesPanel: (messageId: string) => void;
  closeSourcesPanel: () => void;
  sourcesPanelSources: AgentSource[];
  /** Inteligencia elegida solo para la conversación activa. */
  conversationIntelligenceId: string | null;
  setConversationIntelligenceId: (connectionId: string | null) => void;
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
  const [nav, setNav] = useState<NavId>("conversation");
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
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [sourcesPanelMessageId, setSourcesPanelMessageId] = useState<
    string | null
  >(null);
  const [conversationIntelligenceId, setConversationIntelligenceIdState] =
    useState<string | null>(null);
  const socketRef = useRef<HubSocket | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const conversationIntelRef = useRef<string | null>(null);
  activeRef.current = activeConversationId;
  conversationIntelRef.current = conversationIntelligenceId;

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
        return [...map.values()].sort(compareConversationsForSidebar);
      });
      return list;
    } catch {
      /* keep local */
      return null;
    }
  }, [session]);

  /** Poll until the conversation has a semantic title (or give up). */
  const refreshConversationsUntilTitled = useCallback(
    async (conversationId: string) => {
      const delaysMs = [0, 350, 900, 1800, 3500, 7000];
      let elapsed = 0;
      for (const target of delaysMs) {
        const wait = target - elapsed;
        if (wait > 0) {
          await new Promise<void>((r) => {
            window.setTimeout(r, wait);
          });
        }
        elapsed = target;
        const list = await refreshConversations();
        if (!list) continue;
        const found = list.find((c) => c.id === conversationId);
        const title = found?.title?.trim() ?? "";
        if (title && title.toLowerCase() !== "nueva conversación") return;
      }
    },
    [refreshConversations],
  );

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
              pinned: false,
            },
            ...prev,
          ].sort(compareConversationsForSidebar);
        });
      }
    } else if (msg.type === "assistant_done") {
      const sources = normalizeAgentSources(msg.sources);
      const prevStreamId = streamIdRef.current;
      streamIdRef.current = null;
      setBusy(false);
      setToolBanner(null);
      setActive(msg.conversationId);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.streaming || (prevStreamId && m.id === prevStreamId)) {
            const cleaned = sanitizeAssistantDisplayText(m.text, {
              stripFuentes: Boolean(sources && sources.length > 0),
            });
            return {
              ...m,
              id: msg.messageId,
              text: cleaned,
              streaming: false,
              ...(sources ? { sources } : { sources: undefined }),
            };
          }
          return m;
        }),
      );
      // Seed is sync on gateway; poll until title lands (and catch LLM upgrade).
      void refreshConversationsUntilTitled(msg.conversationId);
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
  }, [refreshConversationsUntilTitled]);

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
      setNav("conversation");
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
      setSourcesPanelMessageId(null);
      setConversationIntelligenceIdState(null);
      try {
        const base = resolveHttpBase(session);
        const [rows, intelId] = await Promise.all([
          fetchMessages(base, session.token, id),
          fetchConversationIntelligence(base, session.token, id),
        ]);
        setConversationIntelligenceIdState(intelId);
        setMessages(
          rows
            .filter((r) => r.role === "user" || r.role === "assistant")
            .map((r) => {
              const sources = normalizeAgentSources(r.sources);
              const text = sanitizeAssistantDisplayText(r.content, {
                stripFuentes: Boolean(sources && sources.length > 0),
              });
              return {
                id: r.id,
                role: r.role as "user" | "assistant",
                text,
                ...(sources ? { sources } : {}),
              };
            }),
        );
      } catch {
        setMessages([]);
      }
    },
    [session],
  );

  const setConversationIntelligenceId = useCallback(
    (connectionId: string | null) => {
      setConversationIntelligenceIdState(connectionId);
      if (!session || !activeConversationId) return;
      const base = resolveHttpBase(session);
      void putConversationIntelligence(
        base,
        session.token,
        activeConversationId,
        connectionId,
      ).catch(() => undefined);
    },
    [session, activeConversationId],
  );

  const openSourcesPanel = useCallback((messageId: string) => {
    setSourcesPanelMessageId(messageId);
  }, []);

  const closeSourcesPanel = useCallback(() => {
    setSourcesPanelMessageId(null);
  }, []);

  const sourcesPanelSources = useMemo(() => {
    if (!sourcesPanelMessageId) return [];
    const msg = messages.find((m) => m.id === sourcesPanelMessageId);
    return msg?.sources ?? [];
  }, [messages, sourcesPanelMessageId]);

  const newConversation = useCallback(async () => {
    if (!session) return;
    try {
      const base = resolveHttpBase(session);
      const created = await createConversation(base, session.token);
      setConversations((prev) =>
        [created, ...prev].sort(compareConversationsForSidebar),
      );
      setActive(created.id);
      setMessages([]);
      setSourcesPanelMessageId(null);
      setConversationIntelligenceIdState(null);
      setNav("conversation");
    } catch {
      setActive(null);
      setMessages([]);
      setSourcesPanelMessageId(null);
      setConversationIntelligenceIdState(null);
      setNav("conversation");
    }
  }, [session]);

  const setConversationPinned = useCallback(
    async (id: string, pinned: boolean) => {
      if (!session) return;
      setConversations((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, pinned } : c))
          .sort(compareConversationsForSidebar),
      );
      try {
        const base = resolveHttpBase(session);
        const updated = await patchConversationPinned(
          base,
          session.token,
          id,
          pinned,
        );
        setConversations((prev) =>
          prev
            .map((c) => (c.id === id ? { ...c, ...updated } : c))
            .sort(compareConversationsForSidebar),
        );
      } catch {
        void refreshConversations();
      }
    },
    [session, refreshConversations],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      if (!session) return;
      const wasActive = activeRef.current === id;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (wasActive) {
        setMessages([]);
        setSourcesPanelMessageId(null);
        setActive(null);
        setNav("conversation");
      }
      try {
        const base = resolveHttpBase(session);
        await deleteConversation(base, session.token, id);
      } catch {
        void refreshConversations();
      }
    },
    [session, refreshConversations],
  );

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
    try {
      socketRef.current.sendUserMessage(
        text,
        activeConversationId ?? undefined,
        conversationIntelRef.current ?? undefined,
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
        setUserDisplayName(null);
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
      setConversationPinned,
      removeConversation,
      send,
      pendingConfirm,
      respondConfirm,
      toolBanner,
      busy,
      bannerError,
      bannerDiagnostic,
      userDisplayName,
      setUserDisplayName,
      sourcesPanelMessageId,
      openSourcesPanel,
      closeSourcesPanel,
      sourcesPanelSources,
      conversationIntelligenceId,
      setConversationIntelligenceId,
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
      setConversationPinned,
      removeConversation,
      send,
      pendingConfirm,
      respondConfirm,
      toolBanner,
      busy,
      bannerError,
      bannerDiagnostic,
      userDisplayName,
      sourcesPanelMessageId,
      openSourcesPanel,
      closeSourcesPanel,
      sourcesPanelSources,
      conversationIntelligenceId,
      setConversationIntelligenceId,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
