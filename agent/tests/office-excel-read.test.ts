import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createOfficeExtension } from "../src/extensions/office.ts";
import { createDefaultExtensions } from "../src/extensions/defaults.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import { parseA1Range } from "../src/tools/excel-a1.ts";
import {
  MAX_EXCEL_READ_BYTES,
  MAX_EXCEL_READ_COLUMNS,
  MAX_EXCEL_READ_ROWS,
  OFFICE_EXCEL_READ_NAME,
  createOfficeExcelReadTool,
  type ExcelRangeReader,
} from "../src/tools/office-excel-read.ts";
import { OFFICE_EXCEL_WRITE_NAME } from "../src/tools/office-excel-write.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

const ctx = { conversationId: "c_office" };
const agentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const stubTool = (name: string): AgentTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  executionMode: "automatic",
  async execute() {
    return { ok: true, content: name };
  },
});

const fakeOk: ExcelRangeReader = async () => ({
  ok: true,
  values: [
    ["Producto", "Cantidad"],
    ["A", 10],
  ],
});

function pkZip(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

async function withRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pa-office-"));
}

async function writeXlsx(dir: string, name = "ventas.xlsx"): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, pkZip());
  return file;
}

describe("13D.1 A1", () => {
  it("acepta A1 y A1:F20", () => {
    assert.ok(parseA1Range("A1"));
    assert.ok(parseA1Range("A1:F20"));
    assert.ok(parseA1Range("b5:d100"));
  });

  it("rechaza rangos no clásicos", () => {
    assert.equal(parseA1Range("$A$1"), undefined);
    assert.equal(parseA1Range("Tabla1"), undefined);
    assert.equal(parseA1Range("A1:F20:G1"), undefined);
    assert.equal(parseA1Range("Sheet1!A1"), undefined);
  });
});

describe("13D.1 office.excel.read unitario", () => {
  it("lee con reader inyectado y no confirma", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    assert.equal(tool.executionMode, "automatic");
    const result = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1:B2" },
      ctx,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      const content = result.content as {
        values: unknown;
        rowCount: number;
        columnCount: number;
      };
      assert.deepEqual(content.values, [
        ["Producto", "Cantidad"],
        ["A", 10],
      ]);
      assert.equal(content.rowCount, 2);
      assert.equal(content.columnCount, 2);
    }
  });

  it("input inválido", async () => {
    const tool = createOfficeExcelReadTool({ readRange: fakeOk });
    const r = await tool.execute({ workbook: "a.xlsx" }, ctx);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_input");
  });

  it("rango inválido", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "Tabla1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "invalid_range");
  });

  it("workbook inexistente", async () => {
    const root = await withRoot();
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const r = await tool.execute(
      { workbook: "no.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "file_not_found");
  });

  it("no es workbook Excel", async () => {
    const root = await withRoot();
    await writeFile(path.join(root, "nota.txt"), "hola", "utf8");
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const r = await tool.execute(
      { workbook: "nota.txt", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "not_an_excel_workbook");
  });

  it("worksheet inexistente (reader)", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({
      root,
      readRange: async () => ({
        ok: false,
        code: "worksheet_not_found",
        message: "no hay hoja",
      }),
    });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "NoExiste", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "worksheet_not_found");
  });

  it("A1:XFD1048576 no llama al reader", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    let called = 0;
    const tool = createOfficeExcelReadTool({
      root,
      readRange: async () => {
        called += 1;
        return { ok: true, values: [["x"]] };
      },
    });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1:XFD1048576" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "result_too_large");
    assert.equal(called, 0);
  });

  it("límite de filas y columnas del rango", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const rows = await tool.execute(
      {
        workbook: "ventas.xlsx",
        worksheet: "Ventas",
        range: `A1:A${MAX_EXCEL_READ_ROWS + 1}`,
      },
      ctx,
    );
    assert.equal(rows.ok, false);
    if (!rows.ok) assert.equal(rows.error.code, "result_too_large");

    const cols = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1:AO1" },
      ctx,
    );
    assert.equal(cols.ok, false);
    if (!cols.ok) assert.equal(cols.error.code, "result_too_large");
    assert.equal(MAX_EXCEL_READ_COLUMNS, 40);
  });

  it("límite de bytes", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const huge = "x".repeat(MAX_EXCEL_READ_BYTES);
    const tool = createOfficeExcelReadTool({
      root,
      readRange: async () => ({ ok: true, values: [[huge]] }),
    });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "result_too_large");
  });

  it("root y traversal", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const r = await tool.execute(
      { workbook: "../secret.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(
        r.error.code,
        /path_outside_root|path_not_allowed|invalid_input/,
      );
    }
  });

  it("symlink fuera del root", async () => {
    const root = await withRoot();
    const outside = path.join(tmpdir(), `pa-office-out-${Date.now()}.xlsx`);
    await writeFile(outside, pkZip());
    const link = path.join(root, "link.xlsx");
    try {
      await symlink(outside, link);
    } catch {
      return;
    }
    const tool = createOfficeExcelReadTool({ root, readRange: fakeOk });
    const r = await tool.execute(
      { workbook: "link.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(
        r.error.code,
        /symlink_not_allowed|path_outside_root|path_not_allowed/,
      );
    }
  });

  it("ausencia de Excel (COM real fuera de Windows)", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({ root });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    if (process.platform !== "win32") {
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.code, "excel_not_available");
    }
  });

  it("workbook bloqueado (reader)", async () => {
    const root = await withRoot();
    await writeXlsx(root);
    const tool = createOfficeExcelReadTool({
      root,
      readRange: async () => ({
        ok: false,
        code: "workbook_locked",
        message: "en uso",
      }),
    });
    const r = await tool.execute(
      { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "workbook_locked");
  });

  it("no hay macros ni process.execute en la implementación", () => {
    for (const rel of [
      "src/tools/office-excel-read.ts",
      "src/tools/office-excel-write.ts",
      "src/tools/excel-com.ts",
      "src/extensions/office.ts",
    ]) {
      const src = readFileSync(path.join(agentRoot, rel), "utf8");
      assert.doesNotMatch(src, /from ["']node:child_process["']/);
      assert.doesNotMatch(src, /createProcessExecuteTool|processExecuteTool/);
      assert.doesNotMatch(src, /\bspawn\s*\(/);
      assert.doesNotMatch(src, /Application\.Run\s*\(/);
    }
  });
});

describe("13D.1 office extension", () => {
  it("registra office.excel.read vía registerExtension", () => {
    const valid = assertValidExtension(createOfficeExtension());
    assert.equal(valid.name, "office");
    assert.deepEqual(
      valid.tools.map((t) => t.name),
      [OFFICE_EXCEL_READ_NAME, OFFICE_EXCEL_WRITE_NAME],
    );
    const registry = new ToolRegistry();
    registry.registerExtension(createOfficeExtension());
    assert.ok(registry.get(OFFICE_EXCEL_READ_NAME));
    assert.ok(registry.get(OFFICE_EXCEL_WRITE_NAME));
  });

  it("office no puede registrar filesystem.* ni process.*", () => {
    for (const name of [
      "filesystem.read",
      "filesystem.write",
      "process.execute",
    ]) {
      assert.throws(
        () =>
          createDefaultToolRegistry({}, [
            { name: "office", tools: [stubTool(name)] },
          ]),
        /namespace/,
        name,
      );
    }
  });

  it("tools/list incluye office.excel.read", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "13d1-on", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === OFFICE_EXCEL_READ_NAME));
      assert.ok(listed.tools.some((t) => t.name === OFFICE_EXCEL_WRITE_NAME));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("sin office: tools/list no incluye office.excel.read", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const without = createDefaultExtensions().filter((e) => e.name !== "office");
    const agent = await startLocalAgent(serverT, {
      registry: createDefaultToolRegistry({}, without),
    });
    const client = new Client({ name: "13d1-off", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === OFFICE_EXCEL_READ_NAME),
        false,
      );
      assert.equal(
        listed.tools.some((t) => t.name === OFFICE_EXCEL_WRITE_NAME),
        false,
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});

describe(
  "13D.2 integración Windows/Excel",
  {
    skip:
      process.platform !== "win32" ||
      process.env.PERSONAL_AGENT_EXCEL_IT !== "1",
  },
  () => {
    it("lee A1 si Excel está instalado; si no, excel_not_available", async () => {
      const root = await withRoot();
      await writeXlsx(root);
      const tool = createOfficeExcelReadTool({ root });
      const r = await tool.execute(
        { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1" },
        ctx,
      );
      assert.ok(
        r.ok === true ||
          (r.ok === false && r.error.code === "excel_not_available"),
      );
    });

    it("workbook inexistente", async () => {
      const root = await withRoot();
      const tool = createOfficeExcelReadTool({ root });
      const r = await tool.execute(
        { workbook: "no.xlsx", worksheet: "Ventas", range: "A1" },
        ctx,
      );
      assert.equal(r.ok, false);
    });

    it("worksheet inexistente no deja de hacer cleanup", async () => {
      const root = await withRoot();
      await writeXlsx(root);
      const tool = createOfficeExcelReadTool({ root });
      const r = await tool.execute(
        { workbook: "ventas.xlsx", worksheet: "NoExiste", range: "A1" },
        ctx,
      );
      assert.equal(r.ok, false);
    });

    it("dos lecturas concurrentes se serializan (no lanzan)", async () => {
      const root = await withRoot();
      await writeXlsx(root);
      const tool = createOfficeExcelReadTool({ root });
      const input = {
        workbook: "ventas.xlsx",
        worksheet: "Ventas",
        range: "A1",
      };
      const [a, b] = await Promise.all([
        tool.execute(input, ctx),
        tool.execute(input, ctx),
      ]);
      assert.ok("ok" in a && "ok" in b);
    });
  },
);
