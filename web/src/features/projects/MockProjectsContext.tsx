/**
 * Estado local de proyectos mock + señal de creación desde la sidebar.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  MockProject,
  MockProjectType,
  PendingProjectCreate,
} from "./mockProjects";

type MockProjectsState = {
  projects: MockProject[];
  pendingCreate: PendingProjectCreate;
  /** Abrir workspace de un proyecto existente (p. ej. artículo en Experience Lab). */
  pendingOpenId: string | null;
  activeProjectId: string | null;
  requestCreate: (type: MockProjectType) => void;
  clearPendingCreate: () => void;
  requestOpen: (id: string) => void;
  clearPendingOpen: () => void;
  addProject: (input: {
    title: string;
    type: MockProjectType;
    summary?: string;
  }) => MockProject;
  selectProject: (id: string | null) => void;
  getProject: (id: string) => MockProject | undefined;
};

const Ctx = createContext<MockProjectsState | null>(null);

export function useMockProjects(): MockProjectsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMockProjects outside provider");
  return v;
}

/** Safe hook when provider may be absent (tests). */
export function useMockProjectsOptional(): MockProjectsState | null {
  return useContext(Ctx);
}

export function MockProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<MockProject[]>([
    {
      id: "proj_seed_doctorado",
      title: "Doctorado",
      type: "research",
      summary: "Comparar opciones de doctorado",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [pendingCreate, setPendingCreate] =
    useState<PendingProjectCreate>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const requestCreate = useCallback((type: MockProjectType) => {
    setPendingCreate(type);
  }, []);

  const clearPendingCreate = useCallback(() => {
    setPendingCreate(null);
  }, []);

  const requestOpen = useCallback((id: string) => {
    setActiveProjectId(id);
    setPendingOpenId(id);
  }, []);

  const clearPendingOpen = useCallback(() => {
    setPendingOpenId(null);
  }, []);

  const addProject = useCallback(
    (input: { title: string; type: MockProjectType; summary?: string }) => {
      const row: MockProject = {
        id: `proj_${crypto.randomUUID?.() ?? Date.now()}`,
        title: input.title.trim() || "Sin título",
        type: input.type,
        summary: input.summary,
        createdAt: new Date().toISOString(),
      };
      setProjects((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
      setActiveProjectId(row.id);
      return row;
    },
    [],
  );

  const selectProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
  }, []);

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  const value = useMemo(
    () => ({
      projects,
      pendingCreate,
      pendingOpenId,
      activeProjectId,
      requestCreate,
      clearPendingCreate,
      requestOpen,
      clearPendingOpen,
      addProject,
      selectProject,
      getProject,
    }),
    [
      projects,
      pendingCreate,
      pendingOpenId,
      activeProjectId,
      requestCreate,
      clearPendingCreate,
      requestOpen,
      clearPendingOpen,
      addProject,
      selectProject,
      getProject,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
