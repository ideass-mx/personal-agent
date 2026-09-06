import type {
  Account,
  Automation,
  Block,
  CapabilityId,
  ChatMessage,
  Conversation,
  FileItem,
  MemoryItem,
  Project,
  SettingsState,
  TaskItem,
} from "../types";

export const account: Account = {
  name: "Tony Ideass",
  email: "tony@ideass.mx",
  plan: "Pro",
  initials: "TI",
};

export const initialProjects: Project[] = [
  {
    id: "p-q3",
    name: "Informe Q3 mercado LATAM",
    description: "Investigación competitiva y borrador ejecutivo para el board.",
    instructions: "Prioriza fuentes en español y números auditables.",
    progress: 68,
    capabilities: ["research", "office", "personal"],
    updatedAt: "Hoy · 09:14",
  },
  {
    id: "p-port",
    name: "Cartera personal 2026",
    description: "Seguimiento de posiciones, alertas y rebalanceo trimestral.",
    progress: 42,
    capabilities: ["trading", "personal"],
    updatedAt: "Ayer · 18:40",
  },
  {
    id: "p-ops",
    name: "Automatizar cierre contable",
    description: "Flujos Office + Computer para el cierre mensual.",
    progress: 25,
    capabilities: ["office", "computer"],
    updatedAt: "Vie · 11:02",
  },
];

export const initialConversations: Conversation[] = [
  {
    id: "c-1",
    title: "Comparar fintechs México vs Brasil",
    projectId: "p-q3",
    preview: "Aquí tienes tres ejes y una tabla de fuentes…",
    updatedAt: "Hoy · 09:20",
  },
  {
    id: "c-2",
    title: "Alerta NVDA y tamaño de posición",
    projectId: "p-port",
    preview: "Necesito tu aprobación para ajustar el stop…",
    updatedAt: "Hoy · 08:05",
  },
  {
    id: "c-3",
    title: "Ideas para el fin de semana",
    projectId: null,
    preview: "Te propongo tres planes cortos cerca de casa…",
    updatedAt: "Ayer · 21:12",
  },
  {
    id: "c-4",
    title: "Macro para consolidar hojas Excel",
    projectId: "p-ops",
    preview: "Puedo generar el script y pedirte confirmación…",
    updatedAt: "Vie · 16:30",
  },
  {
    id: "c-5",
    title: "Resumen diario — sin proyecto",
    projectId: null,
    preview: "Buenos días. Tienes 2 aprobaciones pendientes…",
    updatedAt: "Jue · 07:50",
  },
];

export const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    conversationId: "c-1",
    role: "user",
    text: "Compara el panorama fintech en México y Brasil para el informe Q3.",
    createdAt: "09:02",
  },
  {
    id: "m2",
    conversationId: "c-1",
    role: "agent",
    capability: "research",
    text: "Voy a estructurar la comparación en tres ejes: regulación, penetración y funding.",
    blocks: researchWorkingBlocks(),
    createdAt: "09:03",
  },
  {
    id: "m3",
    conversationId: "c-1",
    role: "agent",
    capability: "research",
    blocks: researchResultBlocks(),
    createdAt: "09:18",
  },
  {
    id: "m4",
    conversationId: "c-1",
    role: "agent",
    capability: "personal",
    text: "Cuando quieras, lo convierto en un borrador ejecutivo con tu tono habitual.",
    createdAt: "09:19",
  },
  {
    id: "m5",
    conversationId: "c-2",
    role: "user",
    text: "NVDA subió fuerte. ¿Debo reducir exposición?",
    createdAt: "07:58",
  },
  {
    id: "m6",
    conversationId: "c-2",
    role: "agent",
    capability: "trading",
    blocks: tradingApprovalBlocks(),
    createdAt: "08:01",
  },
  {
    id: "m7",
    conversationId: "c-3",
    role: "user",
    text: "¿Qué puedo hacer este sábado sin viajar lejos?",
    createdAt: "21:00",
  },
  {
    id: "m8",
    conversationId: "c-3",
    role: "agent",
    capability: "personal",
    text: "Tres planes cortos: mercado de artesanos, caminata en el parque y cena con amigos del estudio.",
    blocks: [
      {
        type: "suggestion",
        id: "sug-project",
        kind: "project",
        title: "Esto parece un proyecto",
        body: "Si quieres dar seguimiento a planes personales recurrentes, puedo graduarlo a un proyecto.",
        actionLabel: "Crear proyecto",
      },
    ],
    createdAt: "21:02",
  },
];

export const initialTasks: TaskItem[] = [
  {
    id: "t1",
    title: "Aprobar ajuste de stop en NVDA",
    detail: "Reducir 15 % de la posición y subir el stop a 118.",
    projectId: "p-port",
    capability: "trading",
    needsApproval: true,
    bucket: "today",
  },
  {
    id: "t2",
    title: "Revisar borrador del informe Q3",
    detail: "Sección de regulación lista para tu lectura.",
    projectId: "p-q3",
    capability: "research",
    needsApproval: false,
    bucket: "today",
  },
  {
    id: "t3",
    title: "Confirmar envío del consolidado Excel",
    detail: "La automatización quedó en espera de tu visto bueno.",
    projectId: "p-ops",
    capability: "office",
    needsApproval: true,
    bucket: "week",
  },
  {
    id: "t4",
    title: "Elegir destino del sábado",
    detail: "Suelto — sin proyecto aún.",
    projectId: null,
    capability: "personal",
    needsApproval: false,
    bucket: "week",
  },
  {
    id: "t5",
    title: "Definir umbral de alerta de liquidez",
    projectId: "p-port",
    capability: "trading",
    needsApproval: false,
    bucket: "none",
  },
];

export const initialAutomations: Automation[] = [
  {
    id: "a1",
    name: "Resumen matutino de cartera",
    trigger: "Cada día · 07:30",
    kind: "Recurrente",
    capability: "trading",
    projectId: "p-port",
    enabled: true,
    runs: [
      { id: "r1", at: "Hoy 07:30", status: "ok", summary: "3 movimientos relevantes" },
      { id: "r2", at: "Ayer 07:30", status: "ok", summary: "Sin alertas" },
      { id: "r3", at: "Mié 07:30", status: "skipped", summary: "Mercado cerrado" },
    ],
  },
  {
    id: "a2",
    name: "Monitor de fuentes Q3",
    trigger: "Cuando hay 3+ artículos nuevos",
    kind: "Monitor",
    capability: "research",
    projectId: "p-q3",
    enabled: true,
    runs: [
      { id: "r4", at: "Hoy 08:40", status: "ok", summary: "4 fuentes nuevas" },
      { id: "r5", at: "Vie 19:10", status: "ok", summary: "2 fuentes nuevas" },
    ],
  },
  {
    id: "a3",
    name: "Cierre contable — borrador",
    trigger: "Día 28 de cada mes · 18:00",
    kind: "Recurrente",
    capability: "office",
    projectId: "p-ops",
    enabled: false,
    runs: [
      { id: "r6", at: "Ago 28", status: "error", summary: "Faltó permiso Excel" },
    ],
  },
];

export const initialFiles: FileItem[] = [
  {
    id: "f1",
    name: "Comparativa fintech MX-BR.md",
    kind: "Documento",
    size: "48 KB",
    projectId: "p-q3",
    origin: "research",
    updatedAt: "Hoy",
  },
  {
    id: "f2",
    name: "Informe Q3 — borrador.docx",
    kind: "Documento",
    size: "220 KB",
    projectId: "p-q3",
    origin: "office",
    updatedAt: "Hoy",
  },
  {
    id: "f3",
    name: "posiciones-2026.csv",
    kind: "Datos",
    size: "12 KB",
    projectId: "p-port",
    origin: "trading",
    updatedAt: "Ayer",
  },
  {
    id: "f4",
    name: "script-consolidar.ps1",
    kind: "Script",
    size: "4 KB",
    projectId: "p-ops",
    origin: "computer",
    updatedAt: "Vie",
  },
  {
    id: "f5",
    name: "notas-sabado.md",
    kind: "Nota",
    size: "2 KB",
    projectId: null,
    origin: "personal",
    updatedAt: "Ayer",
  },
];

export const initialMemories: MemoryItem[] = [
  {
    id: "mem1",
    text: "Prefiere resúmenes en viñetas y un párrafo ejecutivo al final.",
    scope: "personal",
    createdAt: "Ago 12",
  },
  {
    id: "mem2",
    text: "El board pide cifras en MXN y USD lado a lado.",
    scope: "project",
    projectId: "p-q3",
    createdAt: "Sep 1",
  },
  {
    id: "mem3",
    text: "Tolerancia al riesgo: moderada; no operar opciones sin confirmación.",
    scope: "project",
    projectId: "p-port",
    createdAt: "Jul 22",
  },
];

export const initialSettings: SettingsState = {
  profile: {
    name: "Tony Ideass",
    about: "Fundador. Trabajo entre producto, research y operaciones.",
    preferences: "Español de México. Tono directo. Evitar jerga innecesaria.",
  },
  agent: {
    name: "Agente",
    personality: "Calmo, preciso, con iniciativa mesurada.",
    style: "balanced",
    detailLevel: "medium",
    initiative: "balanced",
    decisions: "suggest",
    confirmations: true,
  },
  memory: {
    personal: true,
    projects: true,
  },
  capabilities: {
    research: { enabled: true },
    trading: { enabled: true },
    office: { enabled: true },
    computer: { enabled: false },
  },
  notifications: {
    pendingTasks: true,
    approvals: true,
    automations: true,
    agentActivity: false,
    desktop: true,
    mobile: true,
  },
  appearance: {
    theme: "system",
    density: "comfortable",
    animations: true,
    agentLook: "minimal",
  },
  system: {
    startWithOs: true,
    runInBackground: true,
  },
};

export const agentIdleBlocks: Block[] = [
  {
    type: "text",
    tone: "agent",
    text: "¿Qué quieres investigar?",
  },
  {
    type: "text",
    tone: "muted",
    text: "Puedo explorar un tema, comparar opciones o armar un informe a partir de fuentes.",
  },
  {
    type: "cards",
    cards: [
      {
        id: "hint-1",
        title: "Comparar mercados",
        subtitle: "México vs Brasil",
        body: "Regulación, penetración y funding.",
        capability: "research",
      },
      {
        id: "hint-2",
        title: "Mapear competidores",
        subtitle: "Top 8 fintechs",
        body: "Tabla + fuentes citables.",
        capability: "research",
      },
      {
        id: "hint-3",
        title: "Brief ejecutivo",
        subtitle: "1 página",
        body: "Para el board del jueves.",
        capability: "office",
      },
    ],
  },
];

export function researchWorkingBlocks(): Block[] {
  return [
    {
      type: "state",
      status: "searching",
      label: "Buscando información",
      detail: "Fuentes regulatorias y reportes de funding",
    },
    {
      type: "timeline",
      title: "Progreso",
      items: [
        {
          id: "s1",
          title: "Aclarar alcance",
          status: "done",
          at: "09:03",
        },
        {
          id: "s2",
          title: "Recoger fuentes",
          status: "active",
          detail: "CNBV, CVM, PitchBook…",
          at: "09:05",
        },
        {
          id: "s3",
          title: "Sintetizar comparación",
          status: "pending",
        },
        {
          id: "s4",
          title: "Preparar tabla de fuentes",
          status: "pending",
        },
      ],
    },
  ];
}

export function researchResultBlocks(): Block[] {
  return [
    {
      type: "state",
      status: "ready",
      label: "Listo",
      detail: "Comparación estructurada con fuentes",
    },
    {
      type: "statGroup",
      stats: [
        {
          type: "stat",
          label: "Fuentes",
          value: "18",
          delta: "+6 hoy",
          trend: "up",
        },
        {
          type: "stat",
          label: "Cobertura",
          value: "92%",
          delta: "meta 90%",
          trend: "flat",
        },
        {
          type: "stat",
          label: "Confianza",
          value: "Alta",
          delta: "3 ejes",
          trend: "up",
        },
      ],
    },
    {
      type: "cards",
      title: "Hallazgos",
      cards: [
        {
          id: "h1",
          title: "Regulación",
          body: "Brasil avanza más rápido en open finance; México prioriza prevención de fraude.",
          badge: "Eje 1",
          capability: "research",
        },
        {
          id: "h2",
          title: "Penetración",
          body: "MX lidera en pagos; BR en crédito al consumo digital.",
          badge: "Eje 2",
          capability: "research",
        },
        {
          id: "h3",
          title: "Funding",
          body: "Rondas late-stage concentradas en 4 players regionales.",
          badge: "Eje 3",
          capability: "research",
        },
      ],
    },
    {
      type: "comparison",
      title: "México vs Brasil",
      left: {
        title: "México",
        points: [
          "Pagos P2P maduros",
          "Licencias más lentas",
          "Menor profundidad de crédito",
        ],
      },
      right: {
        title: "Brasil",
        points: [
          "Open finance activo",
          "Mayor ticket promedio",
          "Competencia más intensa",
        ],
      },
    },
    {
      type: "chart",
      title: "Funding relativo (índice)",
      kind: "bars",
      labels: ["2022", "2023", "2024", "2025"],
      series: [
        { name: "México", values: [42, 38, 45, 51] },
        { name: "Brasil", values: [70, 62, 68, 74] },
      ],
    },
    {
      type: "table",
      title: "Fuentes clave",
      columns: ["Fuente", "Tipo", "Año", "Uso"],
      rows: [
        ["CNBV — informe fintech", "Regulatorio", "2025", "Licencias"],
        ["CVM — open finance", "Regulatorio", "2024", "Comparativo"],
        ["Latam Tech Review", "Análisis", "2025", "Funding"],
      ],
    },
  ];
}

export function tradingApprovalBlocks(): Block[] {
  return [
    {
      type: "state",
      status: "needs_approval",
      label: "Necesito tu aprobación",
      detail: "Ajuste de posición con riesgo medio",
    },
    {
      type: "statGroup",
      stats: [
        { type: "stat", label: "NVDA", value: "+4.2%", trend: "up" },
        { type: "stat", label: "Peso cartera", value: "11.8%", delta: "meta 9%" },
        { type: "stat", label: "Stop propuesto", value: "118", delta: "desde 112" },
      ],
    },
    {
      type: "chart",
      title: "Precio reciente",
      kind: "area",
      labels: ["L", "M", "X", "J", "V"],
      series: [{ name: "NVDA", values: [112, 114, 113, 119, 122] }],
      unit: "USD",
    },
    {
      type: "approval",
      id: "ap-nvda",
      title: "Reducir 15 % y subir stop",
      summary:
        "Vender una porción de NVDA y colocar stop en 118. No se ejecuta sin tu autorización.",
      risk: "medium",
      capability: "trading",
    },
  ];
}

export function projectSummaryBlocks(project: Project): Block[] {
  return [
    {
      type: "progress",
      label: "Avance del proyecto",
      value: project.progress,
      detail: `${project.progress}% completado`,
    },
    {
      type: "list",
      title: "Capacidades involucradas",
      items: project.capabilities.map((c) => ({
        id: c,
        text: labelCap(c),
        meta: c === "personal" ? "Núcleo" : "Activa",
      })),
    },
    {
      type: "timeline",
      title: "Actividad reciente",
      items: [
        {
          id: "a1",
          title: "Síntesis de hallazgos",
          detail: "Research",
          status: "done",
          at: "Hoy 09:18",
        },
        {
          id: "a2",
          title: "Borrador ejecutivo",
          detail: "Office",
          status: "active",
          at: "Hoy 09:40",
        },
        {
          id: "a3",
          title: "Revisión del board",
          status: "pending",
        },
      ],
    },
  ];
}

function labelCap(c: CapabilityId): string {
  const map: Record<CapabilityId, string> = {
    personal: "Personal",
    research: "Research",
    trading: "Trading",
    office: "Office",
    computer: "Computer",
  };
  return map[c];
}
