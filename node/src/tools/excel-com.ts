/**
 * Lectura y escritura Excel vía COM in-process (Excel.Application).
 * Capa mínima: acquire → abrir/resolver → Range → release.
 *
 * ownsExcel === true  → esta instancia la creó el Agent; Quit en cleanup.
 * ownsExcel === false → GetObject de Excel ya abierto; nunca Quit.
 * Un workbook que abrimos nosotros se cierra (Save si la escritura ok);
 * uno ya abierto no se cierra.
 *
 * winax: addon nativo external. Sin Windows / sin winax / sin Excel →
 * excel_not_available. Sin fallback a shell, Open XML ni Graph.
 *
 * Operaciones serializadas (excel-com-lock). Referencias temporales;
 * winax.release cuando existe. No hay OfficeManager.
 */
import path from "node:path";
import {
  ExcelComShutdownError,
  ExcelComTimeoutError,
  isExcelComShuttingDown,
  withExcelComLock,
} from "./excel-com-lock.ts";
import type { ExcelCell, ExcelRangeReader } from "./office-excel-read.ts";
import type { ExcelRangeWriter } from "./office-excel-write.ts";
import { loadWinaxModule, type WinaxModule } from "./winax-load.ts";

type ExcelCom = {
  Visible?: boolean;
  DisplayAlerts?: boolean;
  EnableEvents?: boolean;
  AutomationSecurity?: number;
  ActiveWorkbook?: WorkbookCom;
  Workbooks: {
    Count: number;
    Item: (i: number | string) => WorkbookCom;
    Open: (
      filename: string,
      updateLinks?: number,
      readOnly?: boolean,
    ) => WorkbookCom;
  };
  Quit: () => void;
};

type WorkbookCom = {
  Name?: string;
  FullName: string;
  Worksheets: {
    Item: (name: string | number) => WorksheetCom;
  };
  Save?: () => void;
  Close: (saveChanges?: boolean) => void;
};

type WorksheetCom = {
  Range: (addr: string) => RangeCom;
};

type RangeCom = {
  Rows: { Count: number };
  Columns: { Count: number };
  Value2: unknown;
};

export type ExcelComSession = {
  excel: ExcelCom;
  ownsExcel: boolean;
};

export type ExcelComHost = {
  acquire(): ExcelComSession;
  release(obj: unknown): void;
};

function comMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isLockError(err: unknown): boolean {
  const msg = comMessage(err).toLowerCase();
  return (
    msg.includes("locked") ||
    msg.includes("in use") ||
    msg.includes("sharing") ||
    msg.includes("800a03ec") ||
    msg.includes("permission")
  );
}

function normalizeCell(value: unknown): ExcelCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function matrixFromValue2(
  raw: unknown,
  rows: number,
  columns: number,
): ExcelCell[][] {
  if (rows === 1 && columns === 1) {
    return [[normalizeCell(raw)]];
  }
  const out: ExcelCell[][] = [];
  if (!Array.isArray(raw)) {
    const empty: ExcelCell[] = [];
    for (let c = 0; c < columns; c += 1) empty.push(null);
    for (let r = 0; r < rows; r += 1) out.push([...empty]);
    if (rows === 1) {
      out[0] = [normalizeCell(raw)];
      while (out[0].length < columns) out[0].push(null);
    }
    return out;
  }
  const oneBased = raw[0] === undefined && (raw as unknown[])[1] !== undefined;
  for (let r = 0; r < rows; r += 1) {
    const srcRow = oneBased
      ? (raw as unknown[])[r + 1]
      : (raw as unknown[])[r];
    const line: ExcelCell[] = [];
    if (!Array.isArray(srcRow)) {
      if (columns === 1) line.push(normalizeCell(srcRow));
      else for (let c = 0; c < columns; c += 1) line.push(null);
    } else {
      const rowOneBased = srcRow[0] === undefined && srcRow[1] !== undefined;
      for (let c = 0; c < columns; c += 1) {
        line.push(normalizeCell(rowOneBased ? srcRow[c + 1] : srcRow[c]));
      }
    }
    out.push(line);
  }
  return out;
}

function sameWorkbookPath(fullName: unknown, resolved: string): boolean {
  if (typeof fullName !== "string") return false;
  return path.resolve(fullName).toLowerCase() === resolved.toLowerCase();
}

function sameWorkbookName(name: unknown, resolved: string): boolean {
  if (typeof name !== "string") return false;
  return name.toLowerCase() === path.basename(resolved).toLowerCase();
}

function findOpenWorkbook(
  excel: ExcelCom,
  resolved: string,
): WorkbookCom | undefined {
  const count = Number(excel.Workbooks.Count) || 0;
  for (let i = 1; i <= count; i += 1) {
    const wb = excel.Workbooks.Item(i);
    if (
      sameWorkbookPath(wb.FullName, resolved) ||
      sameWorkbookName(wb.Name, resolved)
    ) {
      return wb;
    }
  }
  return undefined;
}

function toComMatrix(values: ExcelCell[][]): unknown {
  if (values.length === 1 && values[0]?.length === 1) {
    return values[0][0];
  }
  return values;
}

function winaxHost(winax: WinaxModule): ExcelComHost {
  return {
    acquire(): ExcelComSession {
      try {
        const excel = new winax.Object("Excel.Application", {
          getobject: true,
        }) as ExcelCom;
        return { excel, ownsExcel: false };
      } catch {
        const excel = new winax.Object("Excel.Application") as ExcelCom;
        excel.Visible = false;
        excel.DisplayAlerts = false;
        excel.EnableEvents = false;
        excel.AutomationSecurity = 3;
        return { excel, ownsExcel: true };
      }
    },
    release(obj: unknown) {
      if (winax.release) {
        try {
          winax.release(obj);
        } catch {
          /* ignore */
        }
      }
    },
  };
}

function fail(
  code: string,
  message: string,
): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

function readRangeLocked(
  host: ExcelComHost,
  args: {
    workbookPath?: string;
    worksheet: string;
    rangeA1: string;
    maxRows: number;
    maxColumns: number;
  },
):
  | { ok: true; values: ExcelCell[][] }
  | { ok: false; code: string; message: string } {
  let session: ExcelComSession | undefined;
  let workbook: WorkbookCom | undefined;
  let openedHere = false;
  let sheet: WorksheetCom | undefined;
  let range: RangeCom | undefined;

  try {
    try {
      session = host.acquire();
    } catch (err) {
      return fail(
        "excel_not_available",
        `No se pudo obtener Excel.Application: ${comMessage(err)}`,
      );
    }

    const { excel, ownsExcel } = session;
    if (!ownsExcel) {
      try {
        excel.AutomationSecurity = 3;
        excel.EnableEvents = false;
      } catch {
        /* instancia de usuario */
      }
    }

    if (args.workbookPath !== undefined) {
      const resolved = path.resolve(args.workbookPath);
      workbook = findOpenWorkbook(excel, resolved);

      if (!workbook) {
        try {
          workbook = excel.Workbooks.Open(resolved, 0, true);
          openedHere = true;
        } catch (err) {
          if (isLockError(err)) {
            return fail(
              "workbook_locked",
              "El workbook no es accesible (bloqueado o en uso).",
            );
          }
          return fail("excel_read_error", "No se pudo abrir el workbook en Excel.");
        }
      }
    } else {
      workbook = excel.ActiveWorkbook;
      if (!workbook) {
        return fail(
          "workbook_not_found",
          "No hay workbook activo en Excel.",
        );
      }
    }

    try {
      sheet = workbook.Worksheets.Item(args.worksheet);
    } catch {
      return fail(
        "worksheet_not_found",
        `No existe la hoja ${args.worksheet}.`,
      );
    }

    try {
      range = sheet.Range(args.rangeA1);
    } catch {
      return fail("invalid_range", "El rango no es válido en esa hoja.");
    }

    const rows = Number(range.Rows.Count);
    const columns = Number(range.Columns.Count);
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1
    ) {
      return fail("invalid_range", "Excel no devolvió un rango utilizable.");
    }
    if (rows > args.maxRows || columns > args.maxColumns) {
      return fail(
        "result_too_large",
        "El rango en Excel supera MAX_ROWS o MAX_COLUMNS.",
      );
    }

    return {
      ok: true,
      values: matrixFromValue2(range.Value2, rows, columns),
    };
  } catch (err) {
    process.stderr.write(`[office.excel.read] COM: ${comMessage(err)}\n`);
    return fail("excel_read_error", "Error de lectura en Excel.");
  } finally {
    if (range) host.release(range);
    if (sheet) host.release(sheet);
    try {
      if (openedHere && workbook) workbook.Close(false);
    } catch {
      /* no guardar */
    }
    if (workbook) host.release(workbook);
    if (session) {
      if (session.ownsExcel) {
        try {
          session.excel.Quit();
        } catch {
          /* no matar procesos ajenos */
        }
      }
      host.release(session.excel);
    }
  }
}

export function createExcelComReader(host: ExcelComHost): ExcelRangeReader {
  return async (args) => {
    if (isExcelComShuttingDown()) {
      return fail(
        "excel_unavailable",
        "El Agent está en shutdown; no se inicia Excel.",
      );
    }
    try {
      return await withExcelComLock(async () => {
        if (isExcelComShuttingDown()) {
          return fail(
            "excel_unavailable",
            "El Agent está en shutdown; no se inicia Excel.",
          );
        }
        return readRangeLocked(host, {
          workbookPath: args.workbookPath,
          worksheet: args.worksheet,
          rangeA1: args.rangeA1,
          maxRows: args.maxRows,
          maxColumns: args.maxColumns,
        });
      });
    } catch (err) {
      if (err instanceof ExcelComShutdownError) {
        return fail(
          "excel_unavailable",
          "El Agent está en shutdown; no se inicia Excel.",
        );
      }
      if (err instanceof ExcelComTimeoutError) {
        return fail("excel_timeout", "La lectura Excel superó el tiempo máximo.");
      }
      return fail("excel_read_error", "Error de lectura en Excel.");
    }
  };
}

function writeRangeLocked(
  host: ExcelComHost,
  args: {
    workbookPath?: string;
    worksheet: string;
    rangeA1: string;
    values: ExcelCell[][];
  },
):
  | { ok: true; rows: number; columns: number }
  | { ok: false; code: string; message: string } {
  let session: ExcelComSession | undefined;
  let workbook: WorkbookCom | undefined;
  let openedHere = false;
  let sheet: WorksheetCom | undefined;
  let range: RangeCom | undefined;
  let wrote = false;

  try {
    try {
      session = host.acquire();
    } catch (err) {
      return fail(
        "excel_not_available",
        `No se pudo obtener Excel.Application: ${comMessage(err)}`,
      );
    }

    const { excel, ownsExcel } = session;
    if (!ownsExcel) {
      try {
        excel.AutomationSecurity = 3;
        excel.EnableEvents = false;
      } catch {
        /* instancia de usuario */
      }
    }

    if (args.workbookPath !== undefined) {
      const resolved = path.resolve(args.workbookPath);
      workbook = findOpenWorkbook(excel, resolved);
      if (!workbook) {
        try {
          workbook = excel.Workbooks.Open(resolved, 0, false);
          openedHere = true;
        } catch (err) {
          if (isLockError(err)) {
            return fail(
              "workbook_locked",
              "El workbook no es accesible (bloqueado o en uso).",
            );
          }
          return fail(
            "workbook_not_found",
            "No se encontró el workbook (no se crea uno nuevo).",
          );
        }
      }
    } else {
      workbook = excel.ActiveWorkbook;
      if (!workbook) {
        return fail(
          "workbook_not_found",
          "No hay workbook activo en Excel.",
        );
      }
    }

    try {
      sheet = workbook.Worksheets.Item(args.worksheet);
    } catch {
      return fail(
        "worksheet_not_found",
        `No existe la hoja ${args.worksheet}.`,
      );
    }

    try {
      range = sheet.Range(args.rangeA1);
    } catch {
      return fail("invalid_range", "El rango no es válido en esa hoja.");
    }

    const rows = Number(range.Rows.Count);
    const columns = Number(range.Columns.Count);
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1
    ) {
      return fail("invalid_range", "Excel no devolvió un rango utilizable.");
    }
    if (
      rows !== args.values.length ||
      columns !== (args.values[0]?.length ?? 0)
    ) {
      return fail(
        "range_size_mismatch",
        "El rango en Excel no coincide con las dimensiones de values.",
      );
    }

    range.Value2 = toComMatrix(args.values);
    wrote = true;
    if (openedHere) {
      workbook.Save?.();
    }
    return { ok: true, rows, columns };
  } catch (err) {
    process.stderr.write(`[office.excel.write] COM: ${comMessage(err)}\n`);
    return fail("excel_com_error", "Error de escritura en Excel.");
  } finally {
    if (range) host.release(range);
    if (sheet) host.release(sheet);
    try {
      if (openedHere && workbook) workbook.Close(wrote);
    } catch {
      /* no forzar cierre ajeno */
    }
    if (workbook) host.release(workbook);
    if (session) {
      if (session.ownsExcel) {
        try {
          session.excel.Quit();
        } catch {
          /* no matar procesos ajenos */
        }
      }
      host.release(session.excel);
    }
  }
}

export function createExcelComWriter(host: ExcelComHost): ExcelRangeWriter {
  return async (args) => {
    if (isExcelComShuttingDown()) {
      return fail(
        "excel_unavailable",
        "El Agent está en shutdown; no se inicia Excel.",
      );
    }
    try {
      return await withExcelComLock(async () => {
        if (isExcelComShuttingDown()) {
          return fail(
            "excel_unavailable",
            "El Agent está en shutdown; no se inicia Excel.",
          );
        }
        return writeRangeLocked(host, args);
      });
    } catch (err) {
      if (err instanceof ExcelComShutdownError) {
        return fail(
          "excel_unavailable",
          "El Agent está en shutdown; no se inicia Excel.",
        );
      }
      if (err instanceof ExcelComTimeoutError) {
        return fail(
          "excel_timeout",
          "La escritura Excel superó el tiempo máximo.",
        );
      }
      return fail("excel_com_error", "Error de escritura en Excel.");
    }
  };
}

function defaultHost(): ExcelComHost | undefined {
  const winax = loadWinaxModule();
  if (!winax) return undefined;
  return winaxHost(winax);
}

export const readExcelRangeViaCom: ExcelRangeReader = async (args) => {
  const host = defaultHost();
  if (!host) {
    return fail(
      "excel_not_available",
      "Excel COM no está disponible (Windows + Microsoft Excel + winax).",
    );
  }
  return createExcelComReader(host)(args);
};

export const writeExcelRangeViaCom: ExcelRangeWriter = async (args) => {
  const host = defaultHost();
  if (!host) {
    return fail(
      "excel_not_available",
      "Excel COM no está disponible (Windows + Microsoft Excel + winax).",
    );
  }
  return createExcelComWriter(host)(args);
};
