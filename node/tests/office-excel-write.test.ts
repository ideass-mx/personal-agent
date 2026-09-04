import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createOfficeExtension } from "../src/extensions/office.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import { startLocalAgent } from "../src/lifecycle.ts";
import {
  MAX_EXCEL_WRITE_COLUMNS,
  MAX_EXCEL_WRITE_ROWS,
  OFFICE_EXCEL_WRITE_NAME,
  createOfficeExcelWriteTool,
  type ExcelRangeWriter,
} from "../src/tools/office-excel-write.ts";
import { OFFICE_EXCEL_READ_NAME } from "../src/tools/office-excel-read.ts";

const ctx = { conversationId: "c_office_w" };
const agentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function pkZip(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

async function withRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pa-office-w-"));
}

async function writeXlsx(dir: string, name = "ventas.xlsx"): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, pkZip());
  return file;
}

const okWrite: ExcelRangeWriter = async (args) => ({
  ok: true,
  rows: args.values.length,
  columns: args.values[0]?.length ?? 0,
});

describe("13E office.excel.write unitario", () => {
  it("registra office.excel.write en la extensión office", () => {
    const valid = assertValidExtension(createOfficeExtension());
    assert.ok(valid.tools.some((t) => t.name === OFFICE_EXCEL_WRITE_NAME));
    assert.ok(valid.tools.some((t) => t.name === OFFICE_EXCEL_READ_NAME));
    assert.equal(
      createOfficeExcelWriteTool().executionMode,
      "confirm",
    );
  });

  it("tools/list anuncia office.excel.write", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "13e-list", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === OFFICE_EXCEL_WRITE_NAME));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("input inválido no llama al writer", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute({ sheet: "Enero" }, ctx);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_input");
    assert.equal(called, 0);
  });

  it("values no rectangular → 0 escritura", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "B2:C3",
        values: [["Juan", 1500], ["Pedro"]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_input");
    assert.equal(called, 0);
  });

  it("dimensiones incompatibles → 0 escritura", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "B2:C3",
        values: [["Juan", 1500]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "range_size_mismatch");
    assert.equal(called, 0);
  });

  it("range A1 inválido → 0 escritura", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    for (const range of ["Sheet1!A1", "C:\\x.xlsx", "A1:B2:C3", "$A$1"]) {
      const r = await tool.execute(
        {
          workbook: "ventas.xlsx",
          sheet: "Enero",
          range,
          values: [["x"]],
        },
        ctx,
      );
      assert.equal(r.ok, false, range);
      if (!r.ok) assert.equal(r.error.code, "invalid_range", range);
    }
    assert.equal(called, 0);
  });

  it("fórmulas en values → 0 escritura", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "A1",
        values: [["=CMD()"]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_input");
    assert.equal(called, 0);
  });

  it("workbook inexistente", async () => {
    let called = 0;
    const root = await withRoot();
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute(
      {
        workbook: "no.xlsx",
        sheet: "Enero",
        range: "A1",
        values: [["x"]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    assert.equal(called, 0);
  });

  it("sheet inexistente (writer)", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => ({
        ok: false,
        code: "worksheet_not_found",
        message: "no hay hoja",
      }),
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "NoExiste",
        range: "A1",
        values: [["x"]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "worksheet_not_found");
  });

  it("Excel no disponible", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({ root });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "B2:C3",
        values: [
          ["Juan", 1500],
          ["Pedro", 2300],
        ],
      },
      ctx,
    );
    if (process.platform !== "win32") {
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.code, "excel_not_available");
    }
  });

  it("error COM", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => ({
        ok: false,
        code: "excel_com_error",
        message: "COM",
      }),
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "A1",
        values: [["x"]],
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "excel_com_error");
  });

  it("escritura válida con writer inyectado", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({ root, writeRange: okWrite });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "B2:C3",
        values: [
          ["Juan", 1500],
          ["Pedro", 2300],
        ],
      },
      ctx,
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      const content = r.content as { rowsWritten: number; columnsWritten: number };
      assert.equal(content.rowsWritten, 2);
      assert.equal(content.columnsWritten, 2);
    }
  });

  it("límites de rango no llaman al writer", async () => {
    let called = 0;
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const r = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: `A1:A${MAX_EXCEL_WRITE_ROWS + 1}`,
        values: Array.from({ length: MAX_EXCEL_WRITE_ROWS + 1 }, () => ["x"]),
      },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "result_too_large");
    assert.equal(called, 0);
    assert.equal(MAX_EXCEL_WRITE_COLUMNS, 40);
  });

  it("no hay process.execute ni macros", () => {
    const src = readFileSync(
      path.join(agentRoot, "src/tools/office-excel-write.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /from ["']node:child_process["']/);
    assert.doesNotMatch(src, /\bspawn\s*\(/);
    assert.doesNotMatch(src, /Application\.Run/);
  });
});
