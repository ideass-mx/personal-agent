/**
 * office.excel.read — lectura estructurada de un rango A1.
 * Vive en el Agent. No modifica el workbook ni ejecuta macros.
 * No lanza shell auxiliar. El executionMode lo ignora el Hub (policy).
 */
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { a1RangeSize, isUnsafeWorkbookLocator, parseA1Range } from "./excel-a1.ts";
import { readExcelRangeViaCom } from "./excel-com.ts";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const OFFICE_EXCEL_READ_NAME = "office.excel.read";

export const MAX_EXCEL_READ_ROWS = 200;
export const MAX_EXCEL_READ_COLUMNS = 40;
export const MAX_EXCEL_READ_BYTES = 65_536;

const EXCEL_EXT = new Set([".xlsx", ".xlsm", ".xls", ".xlsb"]);

export type ExcelCell = string | number | boolean | null;

export type ExcelRangeReader = (args: {
  workbookPath?: string;
  worksheet: string;
  rangeA1: string;
  maxRows: number;
  maxColumns: number;
}) => Promise<
  | { ok: true; values: ExcelCell[][] }
  | { ok: false; code: string; message: string }
>;

export type OfficeExcelReadOptions = {
  root?: string;
  readRange?: ExcelRangeReader;
};

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    workbook: { type: "string" },
    worksheet: { type: "string" },
    range: { type: "string" },
  },
  required: ["worksheet", "range"],
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

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function isValidWorksheetName(name: string): boolean {
  if (name.length === 0 || name.length > 31) return false;
  if (name !== name.trim()) return false;
  return !/[\\/*?:[\]]/.test(name);
}

export function createOfficeExcelReadTool(
  options: OfficeExcelReadOptions = {},
): AgentTool {
  const root = options.root;
  const readRange = options.readRange ?? readExcelRangeViaCom;

  return {
    name: OFFICE_EXCEL_READ_NAME,
    description:
      "Lee un rango A1 de un workbook Excel local (solo lectura). Devuelve valores estructurados.",
    inputSchema: INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail(
          "invalid_input",
          "Se espera { worksheet, range, workbook? }.",
        );
      }
      const rec = input as {
        workbook?: unknown;
        worksheet?: unknown;
        range?: unknown;
      };
      if (typeof rec.worksheet !== "string" || typeof rec.range !== "string") {
        return fail("invalid_input", "worksheet y range deben ser string.");
      }
      if ("workbook" in rec && rec.workbook !== undefined) {
        if (typeof rec.workbook !== "string") {
          return fail("invalid_input", "workbook debe ser string si se envía.");
        }
        if (rec.workbook.trim().length === 0) {
          return fail("invalid_input", "workbook no puede estar vacío.");
        }
        if (isUnsafeWorkbookLocator(rec.workbook)) {
          return fail(
            "invalid_input",
            "workbook no admite URL, UNC, device path ni referencia externa.",
          );
        }
      }
      if (!isValidWorksheetName(rec.worksheet)) {
        return fail(
          "invalid_input",
          "worksheet no es un nombre de hoja válido.",
        );
      }

      const parsed = parseA1Range(rec.range);
      if (!parsed) {
        return fail(
          "invalid_range",
          "range debe ser A1 clásico (p. ej. A1:F20).",
        );
      }
      const size = a1RangeSize(parsed);
      if (
        size.rows > MAX_EXCEL_READ_ROWS ||
        size.columns > MAX_EXCEL_READ_COLUMNS
      ) {
        return fail(
          "result_too_large",
          `El rango supera MAX_ROWS=${MAX_EXCEL_READ_ROWS} o MAX_COLUMNS=${MAX_EXCEL_READ_COLUMNS}.`,
        );
      }

      let workbookPath: string | undefined;
      if (typeof rec.workbook === "string") {
        const resolved = await resolveSafePath(rec.workbook, root, "file");
        if (!resolved.ok) return resolved.result;

        let info;
        try {
          info = await lstat(resolved.resolved);
        } catch (err) {
          if (nodeCode(err) === "ENOENT") {
            return fail("file_not_found", "El workbook no existe.");
          }
          return fail("excel_read_error", "No se pudo inspeccionar el workbook.");
        }
        if (info.isSymbolicLink()) {
          return fail(
            "symlink_not_allowed",
            "No se leen workbooks cuyo path es un symlink sin resolver dentro del root.",
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
          return fail("excel_read_error", "No se pudo leer el workbook.");
        }
        workbookPath = resolved.resolved;
      }

      const outcome = await readRange({
        ...(workbookPath !== undefined ? { workbookPath } : {}),
        worksheet: rec.worksheet,
        rangeA1: parsed.a1,
        maxRows: MAX_EXCEL_READ_ROWS,
        maxColumns: MAX_EXCEL_READ_COLUMNS,
      });
      if (!outcome.ok) {
        return fail(outcome.code, outcome.message);
      }

      const values = outcome.values;
      if (values.length > MAX_EXCEL_READ_ROWS) {
        return fail("result_too_large", "El resultado supera MAX_ROWS.");
      }
      for (const row of values) {
        if (row.length > MAX_EXCEL_READ_COLUMNS) {
          return fail("result_too_large", "El resultado supera MAX_COLUMNS.");
        }
      }

      const content = {
        workbook: typeof rec.workbook === "string" ? rec.workbook : null,
        worksheet: rec.worksheet,
        range: parsed.a1,
        values,
        rowCount: values.length,
        columnCount: values[0]?.length ?? 0,
        bytes: 0,
      };
      content.bytes = jsonBytes(content);
      if (content.bytes > MAX_EXCEL_READ_BYTES) {
        return fail(
          "result_too_large",
          `El resultado supera MAX_OUTPUT_BYTES=${MAX_EXCEL_READ_BYTES}.`,
        );
      }
      return { ok: true, content };
    },
  };
}
