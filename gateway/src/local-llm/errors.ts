/**
 * Errores clasificados del modelo/runtime local (sin stack al usuario).
 */
export type LocalModelErrorCode =
  | "MODEL_NOT_INSTALLED"
  | "MODEL_LOAD_FAILED"
  | "MODEL_OUT_OF_MEMORY"
  | "MODEL_RUNTIME_UNAVAILABLE"
  | "MODEL_GENERATION_FAILED"
  | "MODEL_CANCELLED"
  | "MODEL_DOWNLOAD_FAILED"
  | "MODEL_VALIDATION_FAILED"
  | "MODEL_INSUFFICIENT_STORAGE"
  | "RUNTIME_NOT_INSTALLED"
  | "RUNTIME_VALIDATION_FAILED"
  | "RUNTIME_DEPENDENCY_MISSING"
  | "RUNTIME_START_FAILED"
  | "RUNTIME_HEALTH_TIMEOUT"
  | "RUNTIME_CRASHED"
  | "GENERATION_FAILED"
  | "GENERATION_CANCELLED";

export class LocalModelError extends Error {
  readonly code: LocalModelErrorCode;
  readonly userMessage: string;

  constructor(
    code: LocalModelErrorCode,
    userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = "LocalModelError";
    this.code = code;
    this.userMessage = userMessage;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function userMessageForCode(code: LocalModelErrorCode): string {
  switch (code) {
    case "MODEL_NOT_INSTALLED":
      return "Tu modelo local todavía no está instalado.";
    case "MODEL_LOAD_FAILED":
      return "No pudimos iniciar el modelo local.";
    case "MODEL_OUT_OF_MEMORY":
      return "El modelo necesita más memoria para ejecutarse correctamente.";
    case "MODEL_RUNTIME_UNAVAILABLE":
    case "RUNTIME_NOT_INSTALLED":
      return "El motor del modelo local no está disponible en este equipo.";
    case "RUNTIME_VALIDATION_FAILED":
      return "El motor local no es válido. Intenta reinstalarlo.";
    case "RUNTIME_DEPENDENCY_MISSING":
      return "No pudimos preparar el motor local. Falta un componente del sistema necesario para ejecutarlo.";
    case "RUNTIME_START_FAILED":
      return "No pudimos iniciar el motor del modelo local.";
    case "RUNTIME_HEALTH_TIMEOUT":
      return "El motor local tardó demasiado en estar listo.";
    case "RUNTIME_CRASHED":
      return "El motor local se detuvo de forma inesperada.";
    case "MODEL_GENERATION_FAILED":
    case "GENERATION_FAILED":
      return "No pudimos generar una respuesta con el modelo local.";
    case "MODEL_CANCELLED":
    case "GENERATION_CANCELLED":
      return "La generación se canceló.";
    case "MODEL_DOWNLOAD_FAILED":
      return "No pudimos descargar el modelo.";
    case "MODEL_VALIDATION_FAILED":
      return "El archivo del modelo no es válido. Intenta descargarlo de nuevo.";
    case "MODEL_INSUFFICIENT_STORAGE":
      return "No hay suficiente espacio en disco para el modelo.";
    default:
      return "Algo falló con el modelo local.";
  }
}
