/**
 * Cola COM de Excel: una operación a la vez en el proceso Agent.
 * El lock se libera siempre en finally. Shutdown impide nuevas ops.
 * Timeout: el caller recibe excel_timeout; el lock se mantiene hasta que
 * la operación COM termina. No se mata el hilo COM ni el proceso Excel.
 * No es un broker ni un proceso extra.
 */
export const EXCEL_COM_TIMEOUT_MS = 15_000;

export class ExcelComShutdownError extends Error {
  constructor() {
    super("Excel COM no acepta operaciones: Agent en shutdown.");
    this.name = "ExcelComShutdownError";
  }
}

export class ExcelComTimeoutError extends Error {
  constructor() {
    super("La operación Excel superó el tiempo máximo.");
    this.name = "ExcelComTimeoutError";
  }
}

let chain: Promise<unknown> = Promise.resolve();
let shuttingDown = false;

export function isExcelComShuttingDown(): boolean {
  return shuttingDown;
}

/** Solo tests: restaura cola y bandera. */
export function resetExcelComLockForTests(): void {
  shuttingDown = false;
  chain = Promise.resolve();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withExcelComLock<T>(
  fn: () => Promise<T>,
  timeoutMs: number = EXCEL_COM_TIMEOUT_MS,
): Promise<T> {
  if (shuttingDown) throw new ExcelComShutdownError();

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = chain;
  chain = chain.then(() => held, () => held);
  await previous.catch(() => undefined);

  let work: Promise<T> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (shuttingDown) throw new ExcelComShutdownError();
    work = Promise.resolve().then(() => fn());
    const timeoutP = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ExcelComTimeoutError());
      }, timeoutMs);
    });
    return await Promise.race([work, timeoutP]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // El lock se libera solo cuando COM termina. Timeout no abre otra
    // operación simultánea; el llamador ya recibió excel_timeout.
    if (work) await work.catch(() => undefined);
    release();
  }
}

/**
 * Impide nuevas ops y espera a que termine la actual (acotado).
 * El finally de la op activa sigue ejecutando cleanup COM.
 */
export async function shutdownExcelCom(
  waitMs: number = EXCEL_COM_TIMEOUT_MS,
): Promise<void> {
  shuttingDown = true;
  await Promise.race([chain.then(() => undefined, () => undefined), delay(waitMs)]);
}

