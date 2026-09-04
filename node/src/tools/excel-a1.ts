/**
 * Rangos A1 clásicos (A1, A1:F20). Sin tablas, nombres definidos ni R1C1.
 */

const COL_RE = /^[A-Z]{1,3}$/;
const CELL_RE = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/;

export type A1Range = {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
  a1: string;
};

export function columnLettersToIndex(letters: string): number | undefined {
  const u = letters.toUpperCase();
  if (!COL_RE.test(u)) return undefined;
  let n = 0;
  for (const ch of u) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  if (n < 1 || n > 16384) return undefined;
  return n;
}

/**
 * Locators que Office no abre: URLs, UNC, device paths, refs Excel externas.
 * Paths locales (incl. `C:\` dentro de filesystem.root) siguen por resolveSafePath.
 */
export function isUnsafeWorkbookLocator(raw: string): boolean {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower.includes("://") || lower.startsWith("file:")) return true;
  if (t.startsWith("\\\\") || t.startsWith("//")) return true;
  if (t.includes("!")) return true;
  return false;
}

export function parseA1Range(raw: string): A1Range | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toUpperCase();
  if (
    trimmed.length === 0 ||
    trimmed.includes("$") ||
    trimmed.includes("!") ||
    trimmed.includes("[") ||
    trimmed.includes("]") ||
    trimmed.includes(",") ||
    trimmed.includes("\\") ||
    trimmed.includes("://")
  ) {
    return undefined;
  }
  const parts = trimmed.split(":");
  if (parts.length === 1) {
    const cell = parseCell(parts[0] ?? "");
    if (!cell) return undefined;
    return {
      startCol: cell.col,
      startRow: cell.row,
      endCol: cell.col,
      endRow: cell.row,
      a1: `${parts[0]}`,
    };
  }
  if (parts.length !== 2) return undefined;
  const a = parseCell(parts[0] ?? "");
  const b = parseCell(parts[1] ?? "");
  if (!a || !b) return undefined;
  const startCol = Math.min(a.col, b.col);
  const endCol = Math.max(a.col, b.col);
  const startRow = Math.min(a.row, b.row);
  const endRow = Math.max(a.row, b.row);
  return {
    startCol,
    startRow,
    endCol,
    endRow,
    a1: trimmed,
  };
}

function parseCell(token: string): { col: number; row: number } | undefined {
  const m = CELL_RE.exec(token);
  if (!m) return undefined;
  const col = columnLettersToIndex(m[1] ?? "");
  const row = Number(m[2]);
  if (col === undefined || !Number.isInteger(row) || row < 1 || row > 1_048_576) {
    return undefined;
  }
  return { col, row };
}

export function a1RangeSize(range: A1Range): { rows: number; columns: number } {
  return {
    rows: range.endRow - range.startRow + 1,
    columns: range.endCol - range.startCol + 1,
  };
}

