import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetExcelComLockForTests } from "../src/tools/excel-com-lock.ts";
import {
  createExcelComReader,
  createExcelComWriter,
  type ExcelComHost,
  type ExcelComSession,
} from "../src/tools/excel-com.ts";

afterEach(() => {
  resetExcelComLockForTests();
});

function sessionHost(session: ExcelComSession, log: string[]): ExcelComHost {
  return {
    acquire() {
      log.push("acquire");
      return session;
    },
    release(obj: unknown) {
      log.push(`release:${typeof obj}`);
    },
  };
}

function workbookStub(log: string[], worksheetOk: boolean) {
  return {
    FullName: "/tmp/ventas.xlsx",
    Worksheets: {
      Item: (name: string | number) => {
        if (!worksheetOk) throw new Error("missing sheet");
        log.push(`sheet:${String(name)}`);
        return {
          Range: (addr: string) => {
            if (addr === "BAD") throw new Error("bad range");
            return {
              Rows: { Count: 1 },
              Columns: { Count: 1 },
              Value2: "hola",
            };
          },
        };
      },
    },
    Close: (save?: boolean) => {
      log.push(`close:${save}`);
    },
  };
}

describe("13D.2 Excel COM lifecycle", () => {
  it("ownsExcel true: Quit al terminar", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => {
          log.push("open");
          return workbookStub(log, true);
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Ventas",
      rangeA1: "A1",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, true);
    assert.ok(log.includes("quit"));
    assert.ok(log.includes("close:false"));
  });

  it("ownsExcel false: no Quit", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 1,
        Item: () => workbookStub(log, true),
        Open: () => {
          throw new Error("should reuse");
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: false }, log),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Ventas",
      rangeA1: "A1",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, true);
    assert.equal(log.includes("quit"), false);
    assert.equal(log.includes("close:false"), false);
  });

  it("worksheet inexistente aún hace cleanup", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => workbookStub(log, false),
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "No",
      rangeA1: "A1",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "worksheet_not_found");
    assert.ok(log.includes("quit"));
    assert.ok(log.includes("close:false"));
  });

  it("range inválido aún hace cleanup", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => workbookStub(log, true),
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Ventas",
      rangeA1: "BAD",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid_range");
    assert.ok(log.includes("quit"));
  });

  it("no materializa Value2 si Rows.Count excede el límite", async () => {
    let value2 = 0;
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => ({
          FullName: "/tmp/ventas.xlsx",
          Worksheets: {
            Item: () => ({
              Range: () => ({
                Rows: { Count: 500 },
                Columns: { Count: 2 },
                get Value2() {
                  value2 += 1;
                  return [[1, 2]];
                },
              }),
            }),
          },
          Close: () => undefined,
        }),
      },
      Quit: () => undefined,
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: true }, []),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Ventas",
      rangeA1: "A1:B500",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "result_too_large");
    assert.equal(value2, 0);
  });

  it("workbook bloqueado aún hace cleanup", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => {
          throw new Error("file is locked");
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const reader = createExcelComReader(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await reader({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Ventas",
      rangeA1: "A1",
      maxRows: 200,
      maxColumns: 40,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "workbook_locked");
    assert.ok(log.includes("quit"));
    assert.equal(log.includes("close:false"), false);
  });
});

describe("13E Excel COM write", () => {
  function writeStub(log: string[], opts: { sheetOk?: boolean; rangeOk?: boolean } = {}) {
    const sheetOk = opts.sheetOk !== false;
    const rangeOk = opts.rangeOk !== false;
    let stored: unknown;
    return {
      Name: "ventas.xlsx",
      FullName: "/tmp/ventas.xlsx",
      Worksheets: {
        Item: (name: string | number) => {
          if (!sheetOk) throw new Error("missing sheet");
          log.push(`sheet:${String(name)}`);
          return {
            Range: (addr: string) => {
              if (!rangeOk) throw new Error("bad range");
              return {
                Rows: { Count: 2 },
                Columns: { Count: 2 },
                get Value2() {
                  return stored;
                },
                set Value2(v: unknown) {
                  log.push("write");
                  stored = v;
                },
              };
            },
          };
        },
      },
      Save: () => {
        log.push("save");
      },
      Close: (save?: boolean) => {
        log.push(`close:${save}`);
      },
    };
  }

  it("ownsExcel true abre, escribe, Save y Quit", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => {
          log.push("open");
          return writeStub(log);
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const writer = createExcelComWriter(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await writer({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Enero",
      rangeA1: "B2:C3",
      values: [
        ["Juan", 1500],
        ["Pedro", 2300],
      ],
    });
    assert.equal(r.ok, true);
    assert.ok(log.includes("open"));
    assert.ok(log.includes("write"));
    assert.ok(log.includes("save"));
    assert.ok(log.includes("quit"));
  });

  it("ownsExcel false reutiliza y no hace Quit ni Close", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 1,
        Item: () => writeStub(log),
        Open: () => {
          throw new Error("should reuse");
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const writer = createExcelComWriter(
      sessionHost({ excel, ownsExcel: false }, log),
    );
    const r = await writer({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Enero",
      rangeA1: "B2:C3",
      values: [
        ["Juan", 1500],
        ["Pedro", 2300],
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(log.includes("quit"), false);
    assert.equal(log.some((x) => x.startsWith("close:")), false);
    assert.equal(log.includes("save"), false);
  });

  it("sin workbook usa ActiveWorkbook", async () => {
    const log: string[] = [];
    const excel = {
      ActiveWorkbook: writeStub(log),
      Workbooks: {
        Count: 1,
        Item: () => writeStub(log),
        Open: () => {
          throw new Error("should not open");
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const writer = createExcelComWriter(
      sessionHost({ excel, ownsExcel: false }, log),
    );
    const r = await writer({
      worksheet: "Enero",
      rangeA1: "B2:C3",
      values: [
        ["Juan", 1500],
        ["Pedro", 2300],
      ],
    });
    assert.equal(r.ok, true);
    assert.ok(log.includes("write"));
    assert.equal(log.includes("quit"), false);
  });

  it("workbook inexistente no crea uno nuevo", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => {
          throw new Error("not found");
        },
        Add: () => {
          log.push("add");
          throw new Error("no add");
        },
      },
      Quit: () => {
        log.push("quit");
      },
    };
    const writer = createExcelComWriter(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await writer({
      workbookPath: "/tmp/missing.xlsx",
      worksheet: "Enero",
      rangeA1: "A1",
      values: [["x"]],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "workbook_not_found");
    assert.equal(log.includes("add"), false);
    assert.ok(log.includes("quit"));
  });

  it("error COM en Value2 hace cleanup", async () => {
    const log: string[] = [];
    const excel = {
      Workbooks: {
        Count: 0,
        Item: () => {
          throw new Error("empty");
        },
        Open: () => ({
          FullName: "/tmp/ventas.xlsx",
          Worksheets: {
            Item: () => ({
              Range: () => ({
                Rows: { Count: 1 },
                Columns: { Count: 1 },
                set Value2(_v: unknown) {
                  throw new Error("com boom");
                },
              }),
            }),
          },
          Save: () => log.push("save"),
          Close: (save?: boolean) => log.push(`close:${save}`),
        }),
      },
      Quit: () => log.push("quit"),
    };
    const writer = createExcelComWriter(
      sessionHost({ excel, ownsExcel: true }, log),
    );
    const r = await writer({
      workbookPath: "/tmp/ventas.xlsx",
      worksheet: "Enero",
      rangeA1: "A1",
      values: [["x"]],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "excel_com_error");
    assert.ok(log.includes("quit"));
    assert.ok(log.includes("close:false"));
    assert.equal(log.includes("save"), false);
  });

  it("read y write comparten el lock", async () => {
    let concurrent = 0;
    let max = 0;
    const host: ExcelComHost = {
      acquire() {
        concurrent += 1;
        max = Math.max(max, concurrent);
        const log: string[] = [];
        return {
          excel: {
            Workbooks: {
              Count: 0,
              Item: () => {
                throw new Error("empty");
              },
              Open: () => workbookStub(log, true),
            },
            Quit: () => undefined,
          },
          ownsExcel: true,
        };
      },
      release() {
        concurrent -= 1;
      },
    };
    const reader = createExcelComReader(host);
    const writer = createExcelComWriter({
      acquire() {
        concurrent += 1;
        max = Math.max(max, concurrent);
        return {
          excel: {
            ActiveWorkbook: writeStub([]),
            Workbooks: {
              Count: 1,
              Item: () => writeStub([]),
              Open: () => writeStub([]),
            },
            Quit: () => undefined,
          },
          ownsExcel: false,
        };
      },
      release() {
        concurrent -= 1;
      },
    });
    await Promise.all([
      reader({
        workbookPath: "/tmp/ventas.xlsx",
        worksheet: "Ventas",
        rangeA1: "A1",
        maxRows: 200,
        maxColumns: 40,
      }),
      writer({
        worksheet: "Enero",
        rangeA1: "B2:C3",
        values: [
          ["Juan", 1500],
          ["Pedro", 2300],
        ],
      }),
    ]);
    assert.equal(max, 1);
  });
});
