/**
 * office.excel.write — escritura de valores en un rango A1 existente.
 * Vive en el Agent. No crea workbooks/hojas, no ejecuta macros ni shell.
 * El executionMode lo ignora el Hub (policy confirm).
 */
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { a1RangeSize, isUnsafeWorkbookLocator, parseA1Range } from "./excel-a1.ts";
import { writeExcelRangeViaCom } from "./excel-com.ts";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";
import type { ExcelCell } from "./office-excel-read.ts";
import {
  MAX_EXCEL_READ_COLUMNS,
  MAX_EXCEL_READ_ROWS,
} from "./office-excel-read.ts";

export const OFFICE_EXCEL_WRITE_NAME = "office.excel.write";

export const MAX_EXCEL_WRITE_ROWS = MAX_EXCEL_READ_ROWS;
export const MAX_EXCEL_WRITE_COLUMNS = MAX_EXCEL_READ_COLUMNS;

const EXCEL_EXT = new Set([".xlsx", ".xlsm", ".xls", ".xlsb"]);

export type ExcelRangeWriter = (args: {
  workbookPath?: string;
  worksheet: string;
  rangeA1: string;
  values: ExcelCell[][];
}) => Promise<
  | { ok: true; rows: number; columns: number }
  | { ok: false; code: string; message: string }
>;

export type OfficeExcelWriteOptions = {
  root?: string;
  writeRange?: ExcelRangeWriter;
};

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    workbook: { type: "string" },
    sheet: { type: "string" },
    range: { type: "string" },
    values: {
      type: "array",
      items: { type: "array" },
    },
  },
  required: ["sheet", "range", "values"],
  additionalProperties: false,
} as const;

function fail(code: string, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function nodeCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function looksLikeExcelMagic(header: Buffer): boolean {
  if (header.length < 4) return false;
  if (header[0] === 0x50 && header[1] === 0x4b) return true;
  return (
    header[0] === 0xd0 &&
    header[1] === 0xcf &&
    header[2] === 0x11 &&
    header[3] === 0xe0
  );
}

function isValidWorksheetName(name: string): boolean {
  if (name.length === 0 || name.length > 31) return false;
  if (name !== name.trim()) return false;
  return !/[\\/*?:[\]]/.test(name);
}

/**
 * Rechaza fórmulas Excel (`=`, `@`, `+`) y expresiones que empiezan por `-`.
 * Permite literales numéricos negativos (`-123`, `-12.5`) sin parser de Excel.
 */
export function isExcelFormulaLike(value: string): boolean {
  const t = value.trimStart();
  if (t.startsWith("=") || t.startsWith("@") || t.startsWith("+")) return true;
  if (!t.startsWith("-")) return false;
  return !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t.trim());
}

function parseValuesMatrix(
  raw: unknown,
): { ok: true; values: ExcelCell[][] } | { ok: false; code: string; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      message: "values debe ser una matriz no vacía.",
    };
  }
  let columns = -1;
  const values: ExcelCell[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length === 0) {
      return {
        ok: false,
        code: "invalid_input",
        message: "values debe ser una matriz rectangular no vacía.",
      };
    }
    if (columns === -1) columns = row.length;
    else if (row.length !== columns) {
      return {
        ok: false,
        code: "invalid_input",
        message: "values no es rectangular: todas las filas deben tener la misma longitud.",
      };
    }
    const line: ExcelCell[] = [];
    for (const cell of row) {
      if (cell === null) {
        line.push(null);
        continue;
      }
      if (typeof cell === "string") {
        if (isExcelFormulaLike(cell)) {
          return {
            ok: false,
            code: "invalid_input",
            message: "values no admite fórmulas ni expresiones especiales.",
          };
        }
        line.push(cell);
        continue;
      }
      if (typeof cell === "number") {
        if (!Number.isFinite(cell)) {
          return {
            ok: false,
            code: "invalid_input",
            message: "values solo admite números finitos.",
          };
        }
        line.push(cell);
        continue;
      }
      if (typeof cell === "boolean") {
        line.push(cell);
        continue;
      }
      return {
        ok: false,
        code: "invalid_input",
        message: "values solo admite string, number, boolean o null.",
      };
    }
    values.push(line);
  }
  return { ok: true, values };
}

export function createOfficeExcelWriteTool(
  options: OfficeExcelWriteOptions = {},
): AgentTool {
  const root = options.root;
  const writeRange = options.writeRange ?? writeExcelRangeViaCom;

  return {
    name: OFFICE_EXCEL_WRITE_NAME,
    description:
      "Escribe valores en un rango A1 de un workbook Excel existente (no crea archivos ni hojas).",
    inputSchema: INPUT_SCHEMA,
    executionMode: "confirm",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail(
          "invalid_input",
          "Se espera { sheet, range, values, workbook? }.",
        );
      }
      const rec = input as {
        workbook?: unknown;
        sheet?: unknown;
        range?: unknown;
        values?: unknown;
      };
      if (typeof rec.sheet !== "string" || typeof rec.range !== "string") {
        return fail("invalid_input", "sheet y range deben ser string.");
      }
      if (!isValidWorksheetName(rec.sheet)) {
        return fail("invalid_input", "sheet no es un nombre de hoja válido.");
      }
      if ("workbook" in rec && rec.workbook !== undefined) {
        if (typeof rec.workbook !== "string") {
          return fail("invalid_input", "workbook debe ser string si se envía.");
        }
        if (rec.workbook.trim().length === 0) {
          return fail("invalid_input", "workbook no puede estar vacío.");
        }
      }

      const parsed = parseA1Range(rec.range);
      if (!parsed) {
        return fail(
          "invalid_range",
          "range debe ser A1 clásico (p. ej. B2:C3). Sin hojas, archivos ni referencias externas.",
        );
      }
      const size = a1RangeSize(parsed);
      if (
        size.rows > MAX_EXCEL_WRITE_ROWS ||
        size.columns > MAX_EXCEL_WRITE_COLUMNS
      ) {
        return fail(
          "result_too_large",
          `El rango supera MAX_ROWS=${MAX_EXCEL_WRITE_ROWS} o MAX_COLUMNS=${MAX_EXCEL_WRITE_COLUMNS}.`,
        );
      }

      const matrix = parseValuesMatrix(rec.values);
      if (!matrix.ok) return fail(matrix.code, matrix.message);
      if (
        matrix.values.length !== size.rows ||
        (matrix.values[0]?.length ?? 0) !== size.columns
      ) {
        return fail(
          "range_size_mismatch",
          "El número de filas/columnas de values debe coincidir exactamente con el rango.",
        );
      }

      let workbookPath: string | undefined;
      if (typeof rec.workbook === "string") {
        if (isUnsafeWorkbookLocator(rec.workbook)) {
          return fail(
            "invalid_input",
            "workbook no admite URL, UNC, device path ni referencia externa.",
          );
        }
        const resolved = await resolveSafePath(rec.workbook, root, "file");
        if (!resolved.ok) {
          if (!resolved.result.ok && resolved.result.error.code === "file_not_found") {
            return fail("workbook_not_found", "El workbook no existe.");
          }
          return resolved.result;
        }

        let info;
        try {
          info = await lstat(resolved.resolved);
        } catch (err) {
          if (nodeCode(err) === "ENOENT") {
            return fail("workbook_not_found", "El workbook no existe.");
          }
          return fail("excel_com_error", "No se pudo inspeccionar el workbook.");
        }
        if (info.isSymbolicLink()) {
          return fail(
            "symlink_not_allowed",
            "No se escriben workbooks cuyo path es un symlink sin resolver dentro del root.",
          );
        }
        if (!info.isFile()) {
          return fail("not_a_file", "workbook debe ser un archivo.");
        }
        const ext = path.extname(resolved.resolved).toLowerCase();
        if (!EXCEL_EXT.has(ext)) {
          return fail(
            "not_an_excel_workbook",
            "El archivo no tiene extensión de workbook Excel.",
          );
        }
        try {
          const fh = await open(resolved.resolved, "r");
          try {
            const header = Buffer.alloc(8);
            const { bytesRead } = await fh.read(header, 0, 8, 0);
            if (
              bytesRead < 4 ||
              !looksLikeExcelMagic(header.subarray(0, bytesRead))
            ) {
              return fail(
                "not_an_excel_workbook",
                "El archivo no es un workbook Excel válido.",
              );
            }
          } finally {
            await fh.close();
          }
        } catch (err) {
          const code = nodeCode(err);
          if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
            return fail(
              "workbook_locked",
              "El workbook no es accesible (bloqueado o en uso).",
            );
          }
          return fail("excel_com_error", "No se pudo leer el workbook.");
        }
        workbookPath = resolved.resolved;
      }

      const outcome = await writeRange({
        ...(workbookPath !== undefined ? { workbookPath } : {}),
        worksheet: rec.sheet,
        rangeA1: parsed.a1,
        values: matrix.values,
      });
      if (!outcome.ok) {
        return fail(outcome.code, outcome.message);
      }
      return {
        ok: true,
        content: {
          written: true,
          workbook: typeof rec.workbook === "string" ? rec.workbook : null,
          worksheet: rec.sheet,
          range: parsed.a1,
          rows: outcome.rows,
          columns: outcome.columns,
          rowsWritten: outcome.rows,
          columnsWritten: outcome.columns,
        },
      };
    },
  };
}
