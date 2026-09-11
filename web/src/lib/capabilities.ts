/** Capability mapping — mirror PHASE 41 (static UX only). */
export type CapabilityCategory = "Archivos" | "PC" | "Excel";

export type Capability = {
  toolName: string;
  label: string;
  description: string;
  category: CapabilityCategory;
  requiresConfirmation: boolean;
  platformHint?: string;
};

export const MVP_CAPABILITIES: Capability[] = [
  {
    toolName: "filesystem.search",
    label: "Buscar archivos",
    description:
      "Permite al agente localizar archivos en tu computadora por nombre, tipo, fecha o contenido.",
    category: "Archivos",
    requiresConfirmation: false,
  },
  {
    toolName: "filesystem.read",
    label: "Leer archivos",
    description:
      "Permite al agente consultar el contenido de archivos en tu computadora.",
    category: "Archivos",
    requiresConfirmation: false,
  },
  {
    toolName: "filesystem.list",
    label: "Explorar archivos",
    description: "Permite al agente consultar carpetas y archivos disponibles.",
    category: "Archivos",
    requiresConfirmation: false,
  },
  {
    toolName: "filesystem.write",
    label: "Escribir archivos",
    description: "Permite al agente crear o modificar archivos.",
    category: "Archivos",
    requiresConfirmation: true,
  },
  {
    toolName: "filesystem.delete",
    label: "Eliminar archivos",
    description: "Permite al agente eliminar archivos (siempre con tu confirmación).",
    category: "Archivos",
    requiresConfirmation: true,
  },
  {
    toolName: "process.execute",
    label: "Ejecutar comandos",
    description: "Permite al agente ejecutar procesos en la PC.",
    category: "PC",
    requiresConfirmation: true,
  },
  {
    toolName: "office.excel.read",
    label: "Leer Excel",
    description: "Permite consultar información de archivos de Excel.",
    category: "Excel",
    requiresConfirmation: false,
    platformHint: "Solo Windows",
  },
  {
    toolName: "office.excel.write",
    label: "Modificar Excel",
    description: "Permite modificar información de Excel.",
    category: "Excel",
    requiresConfirmation: true,
    platformHint: "Solo Windows",
  },
];

const HIDDEN = new Set([
  "agent.echo",
  "math.add",
  "math.subtract",
  "math.multiply",
  "math.divide",
  "diagnostics.ping",
  "system.info",
  "customer.demo",
]);

/** Etiquetas de progreso en curso (gerundio) para `tool_progress`. */
const TOOL_PROGRESS_LABELS: Record<string, string> = {
  "research.search": "Buscando en la web",
  "research.fetch": "Leyendo página web",
  "filesystem.search": "Buscando archivos",
  "filesystem.read": "Leyendo archivo",
  "filesystem.list": "Explorando archivos",
  "filesystem.write": "Escribiendo archivo",
  "filesystem.delete": "Eliminando archivo",
  "process.execute": "Ejecutando comando",
  "office.excel.read": "Leyendo Excel",
  "office.excel.write": "Modificando Excel",
};

export function labelForTool(toolName: string): string {
  return MVP_CAPABILITIES.find((c) => c.toolName === toolName)?.label ?? toolName;
}

/** Nombre UX mientras la tool se ejecuta (banner `tool_progress`). */
export function progressLabelForTool(toolName: string): string {
  return TOOL_PROGRESS_LABELS[toolName] ?? labelForTool(toolName);
}

export function capabilityFor(toolName: string): Capability | undefined {
  return MVP_CAPABILITIES.find((c) => c.toolName === toolName);
}

export function isHiddenTool(toolName: string): boolean {
  return HIDDEN.has(toolName);
}
