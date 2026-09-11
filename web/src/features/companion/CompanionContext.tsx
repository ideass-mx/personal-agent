/**
 * Estado companion: un hilo principal + espacios + señales (mock local).
 */
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
import { routeIntent } from "./policies/routeIntent";
import {
  inferBookProject,
  isTripStatusQuestion,
  isTripTopic,
  shouldOfferWorkspace,
} from "./policies/shouldOfferWorkspace";
import {
  companionId,
  seedActivity,
  seedFiles,
  seedMainMessages,
  seedMemory,
  seedPromote,
  seedTasks,
  seedWorkspaces,
} from "./seed";
import type {
  ActivityEvent,
  CompanionFile,
  CompanionMessage,
  CompanionTask,
  CompanionWorkspace,
  MemoryEntry,
  PromoteState,
  ToastItem,
  WorkspaceKind,
} from "./types";
import {
  MAIN_THREAD_ID,
  kindLabel,
  sectionsForKind,
} from "./types";

type CompanionNav =
  | "chat"
  | "projects"
  | "workspace"
  | "tasks"
  | "memory"
  | "files"
  | "activity"
  | "create-project";

type CompanionState = {
  companionNav: CompanionNav;
  setCompanionNav: (n: CompanionNav) => void;
  mainMessages: CompanionMessage[];
  workspaceMessages: Record<string, CompanionMessage[]>;
  workspaces: CompanionWorkspace[];
  activeWorkspaceId: string | null;
  openWorkspace: (id: string) => void;
  tasks: CompanionTask[];
  signals: import("./types").CompanionSignal[];
  memory: MemoryEntry[];
  files: CompanionFile[];
  activity: ActivityEvent[];
  promote: PromoteState;
  unreadMain: boolean;
  markMainRead: () => void;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
  workspaceDraft: string;
  setWorkspaceDraft: (v: string) => void;
  typing: boolean;
  workingCount: number;
  sendMain: (text?: string) => void;
  sendWorkspace: (text?: string) => void;
  handleCardAction: (msg: CompanionMessage, action: string) => void;
  acceptPromote: (topicId: string) => void;
  rejectPromote: (topicId: string) => void;
  createWorkspaceFromGoal: (goal: string, kind?: WorkspaceKind) => CompanionWorkspace;
  startCreateProject: (preset?: string) => void;
  createPreset: string | null;
  clearCreatePreset: () => void;
  markSignalSeen: (id: string) => void;
  openSignal: (id: string) => void;
  approveTask: (taskId: string) => void;
  toggleTodo: (taskId: string) => void;
  forgetMemory: (id: string) => void;
  rememberText: (text: string, scope?: "personal" | "project") => void;
};

const Ctx = createContext<CompanionState | null>(null);

export function useCompanion(): CompanionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompanion outside provider");
  return v;
}

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [companionNav, setCompanionNav] = useState<CompanionNav>("chat");
  const [mainMessages, setMainMessages] = useState(seedMainMessages);
  const [workspaceMessages, setWorkspaceMessages] = useState<
    Record<string, CompanionMessage[]>
  >({});
  const [workspaces, setWorkspaces] = useState(seedWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  );
  const [tasks, setTasks] = useState(seedTasks);
  const [signals, setSignals] = useState<import("./types").CompanionSignal[]>(
    [],
  );
  const [memory, setMemory] = useState(seedMemory);
  const [files] = useState(seedFiles);
  const [activity, setActivity] = useState(seedActivity);
  const [promote, setPromote] = useState(seedPromote);
  const [unreadMain, setUnreadMain] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [createPreset, setCreatePreset] = useState<string | null>(null);
  const navRef = useRef(companionNav);
  navRef.current = companionNav;
  const proactiveDone = useRef(false);

  const workingCount = useMemo(
    () => tasks.filter((t) => t.state === "doing" || t.state === "watching").length,
    [tasks],
  );

  const pushToast = useCallback((text: string, target?: string) => {
    const item: ToastItem = {
      id: companionId("toast"),
      text,
      target,
      createdAt: Date.now(),
    };
    setToasts((prev) => [...prev.slice(-4), item]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markMainRead = useCallback(() => {
    setUnreadMain(false);
  }, []);

  const openWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    setCompanionNav("workspace");
  }, []);

  const appendMain = useCallback((msgs: Omit<CompanionMessage, "id" | "createdAt" | "threadId">[]) => {
    setMainMessages((prev) => [
      ...prev,
      ...msgs.map((m) => ({
        ...m,
        id: companionId("m"),
        threadId: MAIN_THREAD_ID,
        createdAt: Date.now(),
      })),
    ]);
  }, []);

  const createWorkspaceFromGoal = useCallback(
    (goal: string, kind?: WorkspaceKind) => {
      const inferred: WorkspaceKind =
        kind ||
        (inferBookProject(goal)
          ? "Book"
          : /viaje|jap[oó]n/i.test(goal)
            ? "Travel"
            : /art[ií]culo|paper|cient[ií]fico/i.test(goal)
              ? "Paper"
              : /inversi[oó]n|finanzas/i.test(goal)
                ? "Finance"
                : /software|app|c[oó]digo/i.test(goal)
                  ? "Software"
                  : "Generic");
      const name =
        inferred === "Book"
          ? "Libro · IA y empleo"
          : inferred === "Travel"
            ? "Viaje a Japón"
            : goal.trim().slice(0, 48) || kindLabel(inferred);
      const threadId = companionId("th");
      const ws: CompanionWorkspace = {
        id: companionId("ws"),
        kind: inferred,
        name,
        objective: goal.trim(),
        sections: sectionsForKind(inferred),
        status: "live",
        progress: 8,
        threadId,
        whileAway: ["Acabo de crear el espacio y mover el contexto reunido."],
        nextSteps: ["Revisar el overview", "Decidir el siguiente paso"],
        needsDecision: undefined,
        liveSections: Object.fromEntries(
          sectionsForKind(inferred).map((s, i) => [
            s,
            i === 0 ? "live" : "wait",
          ]),
        ) as CompanionWorkspace["liveSections"],
      };
      setWorkspaces((prev) => [ws, ...prev]);
      setWorkspaceMessages((prev) => ({
        ...prev,
        [ws.id]: [
          {
            id: companionId("m"),
            threadId,
            role: "agent",
            text: `Este hilo queda anclado a «${ws.name}». Misma memoria, mismo compañero — conversación del espacio.`,
            createdAt: Date.now(),
          },
        ],
      }));
      setActivity((prev) => [
        {
          id: companionId("a"),
          title: "Espacio creado",
          detail: ws.name,
          at: Date.now(),
          projectId: ws.id,
        },
        ...prev,
      ]);
      setMemory((prev) => [
        {
          id: companionId("mem"),
          scope: "project",
          projectId: ws.id,
          text: `Objetivo: ${goal.trim()}`,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
      return ws;
    },
    [],
  );

  const acceptPromote = useCallback(
    (topicId: string) => {
      if (topicId !== "trip") return;
      const notes = promote.notes;
      const goal =
        notes.join(" · ") ||
        "Planear un viaje a Japón en marzo: vuelos, alojamiento e itinerario.";
      const ws = createWorkspaceFromGoal(goal, "Travel");
      setPromote((p) => ({
        ...p,
        workspaceId: ws.id,
        rejected: false,
      }));
      appendMain([
        {
          role: "agent",
          text: `Listo. Moví todo lo del viaje al espacio «${ws.name}».`,
          action: {
            label: "Abrir el espacio",
            kind: "open",
            target: ws.id,
          },
        },
      ]);
      pushToast(`Espacio «${ws.name}» creado`, `workspace:${ws.id}`);
    },
    [appendMain, createWorkspaceFromGoal, promote.notes, pushToast],
  );

  const rejectPromote = useCallback(
    (topicId: string) => {
      if (topicId !== "trip") return;
      setPromote((p) => ({ ...p, rejected: true }));
      appendMain([
        {
          role: "agent",
          text: "Lo dejo aquí y no te insisto. Pregúntame cuando quieras.",
        },
      ]);
    },
    [appendMain],
  );

  const handleCardAction = useCallback(
    (msg: CompanionMessage, action: string) => {
      if (msg.card?.kind === "promote") {
        if (action === "accept") acceptPromote(msg.card.topicId);
        if (action === "reject") rejectPromote(msg.card.topicId);
        return;
      }
      if (msg.card?.kind === "attention") {
        if (action === "approve-email" || action === msg.card.primaryAction) {
          setTasks((prev) =>
            prev.map((t) =>
              t.state === "needs-you" && t.title.includes("correo")
                ? { ...t, state: "done" as const, owner: "you" as const }
                : t.title.includes("Redactar respuesta")
                  ? { ...t, state: "done" as const, pct: 100 }
                  : t,
            ),
          );
          appendMain([
            {
              role: "agent",
              text: "Correo aprobado. Lo envío y te confirmo cuando salga.",
            },
          ]);
          pushToast("Correo aprobado");
          return;
        }
        appendMain([
          {
            role: "agent",
            text: "De acuerdo. Lo dejo en Tasks para cuando quieras editarlo.",
          },
        ]);
      }
    },
    [acceptPromote, appendMain, pushToast, rejectPromote],
  );

  const respondTripStatus = useCallback(() => {
    const p = promote;
    if (p.workspaceId) {
      const ws = workspaces.find((w) => w.id === p.workspaceId);
      appendMain([
        {
          role: "agent",
          text: ws
            ? `El viaje va en el espacio «${ws.name}» (${ws.progress}% · ${ws.status === "live" ? "trabajando" : ws.status === "wait" ? "esperándote" : "inactivo"}).`
            : "El viaje ya tiene su espacio.",
          action: ws
            ? { label: "Abrir el espacio", kind: "open", target: ws.id }
            : undefined,
        },
      ]);
      return;
    }
    const summary =
      p.notes.length > 0
        ? `Hasta ahora reunimos:\n${p.notes.map((n) => `· ${n}`).join("\n")}`
        : "Aún no hay mucho reunido del viaje; puedo ayudarte a planearlo aquí mismo.";
    appendMain([
      {
        role: "agent",
        text: `${summary}\n\nLa memoria no depende de crear un proyecto — esto ya está guardado.`,
        card:
          !p.rejected || (p.rejected && !p.reoffered)
            ? {
                kind: "promote",
                topicId: "trip",
                label: p.label,
                reason: "¿Le doy su propio espacio al viaje?",
              }
            : undefined,
      },
    ]);
  }, [appendMain, promote, workspaces]);

  const sendMain = useCallback(
    (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text) return;
      setDraft("");
      appendMain([{ role: "user", text }]);
      setTyping(true);

      window.setTimeout(() => {
        setTyping(false);
        const intent = routeIntent(text);

        if (intent === "action") {
          appendMain([
            {
              role: "agent",
              text: "Hecho.",
            },
          ]);
          pushToast("Acción ejecutada");
          return;
        }

        if (intent === "task") {
          const title = text.replace(/^recu[eé]rdame\s+/i, "").slice(0, 80);
          const task: CompanionTask = {
            id: companionId("t"),
            title: title || "Recordatorio",
            owner: "you",
            state: "todo",
            when: /viernes/i.test(text) ? "Viernes" : undefined,
          };
          setTasks((prev) => [task, ...prev]);
          appendMain([
            {
              role: "agent",
              text: `Listo. Añadí «${task.title}» a tus pendientes${task.when ? ` (${task.when})` : ""}.`,
              action: { label: "Ver Tasks", kind: "tasks" },
            },
          ]);
          pushToast("Tarea creada");
          return;
        }

        if (intent === "project" || inferBookProject(text)) {
          setCreatePreset(text);
          setCompanionNav("create-project");
          appendMain([
            {
              role: "agent",
              text: "Esto tiene cuerpo de proyecto. Te muestro cómo lo interpretaría antes de crear el espacio.",
            },
          ]);
          return;
        }

        if (isTripStatusQuestion(text)) {
          respondTripStatus();
          return;
        }

        if (isTripTopic(text)) {
          const next: PromoteState = {
            ...promote,
            mentions: promote.mentions + 1,
            notes: [...promote.notes, text].slice(-8),
          };
          const materialHeavy =
            next.notes.length >= 3 ||
            /\b(itinerario|4 vuelos|opciones de vuelo)\b/i.test(text);
          const decision = shouldOfferWorkspace({
            promote: next,
            isStatusQuestion: false,
            isTopicTurn: true,
            materialHeavy,
          });
          let agentText =
            next.mentions <= 1
              ? "Claro. Puedo ayudarte con fechas, vuelos, alojamiento e itinerario. Empecemos por marzo: ¿fechas flexibles o fijas?"
              : next.mentions === 2
                ? "Anoto eso. Sigo armando opciones aquí en el chat — sin fricción."
                : "Voy incorporando lo que me digas. El contexto queda en memoria aunque no creemos un espacio.";
          if (/opciones|vuelos|itinerario/i.test(text) && next.mentions >= 3) {
            agentText =
              "Perfecto — ya tenemos varias piezas: fechas tentativas, opciones de vuelo y un borrador de itinerario en el hilo.";
          }
          setPromote(
            decision.offer && decision.reoffer
              ? { ...next, reoffered: true }
              : next,
          );
          appendMain([
            {
              role: "agent",
              text: agentText,
              card: decision.offer
                ? {
                    kind: "promote",
                    topicId: "trip",
                    label: next.label,
                    reason: decision.reason,
                    reoffer: decision.reoffer,
                  }
                : undefined,
            },
          ]);
          return;
        }

        appendMain([
          {
            role: "agent",
            text: "Te escucho. Puedes pedirme algo cotidiano, una tarea, o un trabajo con más cuerpo — yo organizo el resto.",
          },
        ]);
      }, 450);
    },
    [appendMain, draft, promote, pushToast, respondTripStatus],
  );

  const sendWorkspace = useCallback(
    (raw?: string) => {
      const text = (raw ?? workspaceDraft).trim();
      if (!text || !activeWorkspaceId) return;
      setWorkspaceDraft("");
      const ws = workspaces.find((w) => w.id === activeWorkspaceId);
      if (!ws) return;
      setWorkspaceMessages((prev) => ({
        ...prev,
        [activeWorkspaceId]: [
          ...(prev[activeWorkspaceId] || []),
          {
            id: companionId("m"),
            threadId: ws.threadId,
            role: "user",
            text,
            createdAt: Date.now(),
          },
        ],
      }));
      window.setTimeout(() => {
        setWorkspaceMessages((prev) => ({
          ...prev,
          [activeWorkspaceId]: [
            ...(prev[activeWorkspaceId] || []),
            {
              id: companionId("m"),
              threadId: ws.threadId,
              role: "agent",
              text: `Dentro de «${ws.name}»: ${text.slice(0, 120)}. Trabajo con el contexto de este espacio.`,
              createdAt: Date.now(),
            },
          ],
        }));
      }, 400);
    },
    [activeWorkspaceId, workspaceDraft, workspaces],
  );

  const startCreateProject = useCallback((preset?: string) => {
    setCreatePreset(preset ?? null);
    setCompanionNav("create-project");
  }, []);

  const clearCreatePreset = useCallback(() => setCreatePreset(null), []);

  const markSignalSeen = useCallback((id: string) => {
    setSignals((prev) =>
      prev.map((s) => (s.id === id ? { ...s, seen: true } : s)),
    );
  }, []);

  const openSignal = useCallback(
    (id: string) => {
      const s = signals.find((x) => x.id === id);
      if (!s) return;
      markSignalSeen(id);
      setNotifOpen(false);
      if (s.target.startsWith("workspace:")) {
        openWorkspace(s.target.slice("workspace:".length));
        return;
      }
      if (s.target === "tasks") {
        setCompanionNav("tasks");
        return;
      }
      setCompanionNav("chat");
      markMainRead();
    },
    [markMainRead, markSignalSeen, openWorkspace, signals],
  );

  const approveTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, state: "done" as const } : t,
      ),
    );
  }, []);

  const toggleTodo = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              state: t.state === "done" ? ("todo" as const) : ("done" as const),
            }
          : t,
      ),
    );
  }, []);

  const forgetMemory = useCallback((id: string) => {
    setMemory((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const rememberText = useCallback(
    (text: string, scope: "personal" | "project" = "personal") => {
      setMemory((prev) => [
        {
          id: companionId("mem"),
          scope,
          projectId:
            scope === "project" ? activeWorkspaceId || undefined : undefined,
          text: text.trim(),
          createdAt: Date.now(),
        },
        ...prev,
      ]);
    },
    [activeWorkspaceId],
  );

  // Mensaje proactivo del agente.
  useEffect(() => {
    if (proactiveDone.current) return;
    const t = window.setTimeout(() => {
      proactiveDone.current = true;
      const msg =
        "Terminé de organizar las capturas del escritorio. ¿Quieres que las archive por fecha?";
      appendMain([{ role: "agent", text: msg }]);
      const signal = {
        id: companionId("sig"),
        text: "El agente terminó de organizar capturas",
        where: "Línea principal",
        target: "main",
        createdAt: Date.now(),
        seen: false,
      };
      setSignals((prev) => [signal, ...prev]);
      if (navRef.current !== "chat") {
        setUnreadMain(true);
        pushToast("Nuevo mensaje del agente", "main");
      }
      setActivity((prev) => [
        {
          id: companionId("a"),
          title: "Organización de capturas",
          detail: "Completado · esperando tu preferencia de archivo",
          at: Date.now(),
        },
        ...prev,
      ]);
    }, 9000);
    return () => window.clearTimeout(t);
  }, [appendMain, pushToast]);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (companionNav === "chat") markMainRead();
  }, [companionNav, markMainRead]);

  const value = useMemo(
    () => ({
      companionNav,
      setCompanionNav,
      mainMessages,
      workspaceMessages,
      workspaces,
      activeWorkspaceId,
      openWorkspace,
      tasks,
      signals,
      memory,
      files,
      activity,
      promote,
      unreadMain,
      markMainRead,
      notifOpen,
      setNotifOpen,
      toasts,
      dismissToast,
      paletteOpen,
      setPaletteOpen,
      draft,
      setDraft,
      workspaceDraft,
      setWorkspaceDraft,
      typing,
      workingCount,
      sendMain,
      sendWorkspace,
      handleCardAction,
      acceptPromote,
      rejectPromote,
      createWorkspaceFromGoal,
      startCreateProject,
      createPreset,
      clearCreatePreset,
      markSignalSeen,
      openSignal,
      approveTask,
      toggleTodo,
      forgetMemory,
      rememberText,
    }),
    [
      companionNav,
      mainMessages,
      workspaceMessages,
      workspaces,
      activeWorkspaceId,
      openWorkspace,
      tasks,
      signals,
      memory,
      files,
      activity,
      promote,
      unreadMain,
      markMainRead,
      notifOpen,
      toasts,
      dismissToast,
      paletteOpen,
      draft,
      workspaceDraft,
      typing,
      workingCount,
      sendMain,
      sendWorkspace,
      handleCardAction,
      acceptPromote,
      rejectPromote,
      createWorkspaceFromGoal,
      startCreateProject,
      createPreset,
      clearCreatePreset,
      markSignalSeen,
      openSignal,
      approveTask,
      toggleTodo,
      forgetMemory,
      rememberText,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
