import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  account as seedAccount,
  agentIdleBlocks,
  initialAutomations,
  initialConversations,
  initialFiles,
  initialMemories,
  initialMessages,
  initialProjects,
  initialSettings,
  initialTasks,
  researchResultBlocks,
  researchWorkingBlocks,
} from "../mock/data";
import type {
  Account,
  AgentSpaceMode,
  Automation,
  Block,
  CapabilityId,
  ChatMessage,
  Conversation,
  FileItem,
  MemoryItem,
  NavState,
  Project,
  ProjectTab,
  SettingsSectionId,
  SettingsState,
  TaskItem,
} from "../types";

type AppContextValue = {
  account: Account;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  nav: NavState;
  setNav: (nav: NavState) => void;
  projects: Project[];
  conversations: Conversation[];
  messages: ChatMessage[];
  tasks: TaskItem[];
  automations: Automation[];
  files: FileItem[];
  memories: MemoryItem[];
  settings: SettingsState;
  setSettings: (next: SettingsState | ((prev: SettingsState) => SettingsState)) => void;
  agentBlocks: Block[];
  agentCapability: CapabilityId;
  agentMode: AgentSpaceMode;
  startResearchDemo: () => void;
  stopAgentWork: () => void;
  showResearchResults: () => void;
  createProject: (input: {
    name: string;
    description: string;
    instructions?: string;
  }) => void;
  startBlankConversation: () => void;
  sendMessage: (conversationId: string, text: string) => void;
  toggleAutomation: (id: string) => void;
  toggleTaskDone: (id: string) => void;
  deleteMemory: (id: string) => void;
  deleteAllMemories: () => void;
  openConversation: (id: string) => void;
  openProject: (id: string, tab?: ProjectTab) => void;
  openSettings: (section?: SettingsSectionId) => void;
  approveAction: (id: string) => void;
  draftText: string;
  setDraftText: (text: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [nav, setNav] = useState<NavState>({
    screen: "agent",
    capability: "research",
    mode: "idle",
  });
  const [projects, setProjects] = useState(initialProjects);
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [tasks, setTasks] = useState(initialTasks);
  const [automations, setAutomations] = useState(initialAutomations);
  const [files] = useState(initialFiles);
  const [memories, setMemories] = useState(initialMemories);
  const [settings, setSettings] = useState(initialSettings);
  const [agentBlocks, setAgentBlocks] = useState<Block[]>(agentIdleBlocks);
  const [agentCapability, setAgentCapability] = useState<CapabilityId>("research");
  const [agentMode, setAgentMode] = useState<AgentSpaceMode>("idle");
  const [draftText, setDraftText] = useState("");

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const startResearchDemo = useCallback(() => {
    setAgentCapability("research");
    setAgentMode("working");
    setAgentBlocks(researchWorkingBlocks());
    setNav({ screen: "agent", capability: "research", mode: "working" });
  }, []);

  const stopAgentWork = useCallback(() => {
    setAgentMode("idle");
    setAgentBlocks(agentIdleBlocks);
    setNav({ screen: "agent", capability: agentCapability, mode: "idle" });
  }, [agentCapability]);

  const showResearchResults = useCallback(() => {
    setAgentCapability("research");
    setAgentMode("results");
    setAgentBlocks(researchResultBlocks());
    setNav({ screen: "agent", capability: "research", mode: "results" });
  }, []);

  const createProject = useCallback(
    (input: { name: string; description: string; instructions?: string }) => {
      const id = `p-${Date.now()}`;
      const project: Project = {
        id,
        name: input.name.trim() || "Proyecto sin título",
        description: input.description.trim() || "Sin descripción",
        instructions: input.instructions?.trim() || undefined,
        progress: 0,
        capabilities: ["personal"],
        updatedAt: "Ahora",
      };
      setProjects((prev) => [project, ...prev]);
      setCreateProjectOpen(false);
      setNav({ screen: "project", projectId: id, tab: "summary" });
    },
    [],
  );

  const startBlankConversation = useCallback(() => {
    const id = `c-${Date.now()}`;
    const conversation: Conversation = {
      id,
      title: "Nueva conversación",
      projectId: null,
      preview: "Escribe para comenzar…",
      updatedAt: "Ahora",
    };
    setConversations((prev) => [conversation, ...prev]);
    setNav({ screen: "conversation", conversationId: id });
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      conversationId,
      role: "user",
      text: trimmed,
      createdAt: "Ahora",
    };
    const agentMsg: ChatMessage = {
      id: `m-${Date.now() + 1}`,
      conversationId,
      role: "agent",
      capability: "personal",
      text: "Entendido. Estoy trabajando con datos de demostración — en producción aquí respondería el agente real.",
      createdAt: "Ahora",
    };
    setMessages((prev) => [...prev, userMsg, agentMsg]);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              title: c.title === "Nueva conversación" ? trimmed.slice(0, 48) : c.title,
              preview: trimmed,
              updatedAt: "Ahora",
            }
          : c,
      ),
    );
    setDraftText("");
  }, []);

  const toggleAutomation = useCallback((id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
  }, []);

  const toggleTaskDone = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteAllMemories = useCallback(() => {
    setMemories([]);
  }, []);

  const openConversation = useCallback((id: string) => {
    setNav({ screen: "conversation", conversationId: id });
    setAccountMenuOpen(false);
  }, []);

  const openProject = useCallback((id: string, tab: ProjectTab = "summary") => {
    setNav({ screen: "project", projectId: id, tab });
    setAccountMenuOpen(false);
  }, []);

  const openSettings = useCallback((section: SettingsSectionId = "profile") => {
    setNav({ screen: "settings", section });
    setAccountMenuOpen(false);
  }, []);

  const approveAction = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.needsApproval && (t.id === id || id.startsWith("ap-"))
          ? { ...t, done: true, needsApproval: false }
          : t,
      ),
    );
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      account: seedAccount,
      sidebarCollapsed,
      toggleSidebar,
      accountMenuOpen,
      setAccountMenuOpen,
      createProjectOpen,
      setCreateProjectOpen,
      nav,
      setNav,
      projects,
      conversations,
      messages,
      tasks,
      automations,
      files,
      memories,
      settings,
      setSettings,
      agentBlocks,
      agentCapability,
      agentMode,
      startResearchDemo,
      stopAgentWork,
      showResearchResults,
      createProject,
      startBlankConversation,
      sendMessage,
      toggleAutomation,
      toggleTaskDone,
      deleteMemory,
      deleteAllMemories,
      openConversation,
      openProject,
      openSettings,
      approveAction,
      draftText,
      setDraftText,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      accountMenuOpen,
      createProjectOpen,
      nav,
      projects,
      conversations,
      messages,
      tasks,
      automations,
      files,
      memories,
      settings,
      agentBlocks,
      agentCapability,
      agentMode,
      startResearchDemo,
      stopAgentWork,
      showResearchResults,
      createProject,
      startBlankConversation,
      sendMessage,
      toggleAutomation,
      toggleTaskDone,
      deleteMemory,
      deleteAllMemories,
      openConversation,
      openProject,
      openSettings,
      approveAction,
      draftText,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de AppProvider");
  return ctx;
}
