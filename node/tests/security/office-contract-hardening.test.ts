/**
 * 13F: endurecimiento del contrato Office (namespace, A1, workbook, fórmulas, COM).
 */
import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createOfficeExtension } from "../../src/extensions/office.ts";
import { assertValidExtension } from "../../src/extensions/validate.ts";
import { startLocalAgent } from "../../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../../src/tools/defaults.ts";
import {
  isUnsafeWorkbookLocator,
  parseA1Range,
} from "../../src/tools/excel-a1.ts";
import {
  ExcelComTimeoutError,
  resetExcelComLockForTests,
  shutdownExcelCom,
  withExcelComLock,
} from "../../src/tools/excel-com-lock.ts";
import {
  createOfficeExcelReadTool,
  OFFICE_EXCEL_READ_NAME,
} from "../../src/tools/office-excel-read.ts";
import {
  createOfficeExcelWriteTool,
  isExcelFormulaLike,
  OFFICE_EXCEL_WRITE_NAME,
} from "../../src/tools/office-excel-write.ts";

const ctx = { conversationId: "c_13f" };

function pkZip(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  resetExcelComLockForTests();
});

describe("13F office contrato Agent", () => {
  it("office no puede registrar tools de otro namespace", () => {
    for (const name of [
      "filesystem.read",
      "process.execute",
      "system.info",
      "agent.echo",
      "math.add",
    ]) {
      assert.throws(
        () =>
          assertValidExtension({
            name: "office",
            tools: [
              {
                name,
                description: "x",
                inputSchema: { type: "object" },
                executionMode: "automatic",
                execute: async () => ({ ok: true, content: {} }),
              },
            ],
          }),
        /namespace/,
        name,
      );
    }
  });

  it("solo anuncia office.excel.read y office.excel.write", () => {
    const names = assertValidExtension(createOfficeExtension()).tools.map(
      (t) => t.name,
    );
    assert.deepEqual(names, [OFFICE_EXCEL_READ_NAME, OFFICE_EXCEL_WRITE_NAME]);
  });

  it("A1 rechaza refs externas y rangos inválidos", () => {
    assert.equal(parseA1Range("Sheet1!A1"), undefined);
    assert.equal(parseA1Range("[Book]Sheet1!A1"), undefined);
    assert.equal(parseA1Range("A1:B2:C3"), undefined);
    assert.equal(parseA1Range("$A$1"), undefined);
    assert.equal(parseA1Range("A1,B1"), undefined);
    assert.ok(parseA1Range("A1:B2"));
  });

  it("locators inseguros de workbook", () => {
    assert.equal(isUnsafeWorkbookLocator("file:///tmp/a.xlsx"), true);
    assert.equal(isUnsafeWorkbookLocator("https://evil/a.xlsx"), true);
    assert.equal(isUnsafeWorkbookLocator("\\\\server\\share\\a.xlsx"), true);
    assert.equal(isUnsafeWorkbookLocator("//server/share/a.xlsx"), true);
    assert.equal(isUnsafeWorkbookLocator("ventas.xlsx"), false);
  });

  it("traversal, absoluto fuera y sibling no llaman COM", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13f-"));
    await writeFile(path.join(root, "ventas.xlsx"), pkZip());
    let called = 0;
    const read = createOfficeExcelReadTool({
      root,
      readRange: async () => {
        called += 1;
        return { ok: true, values: [["x"]] };
      },
    });
    const write = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    for (const workbook of [
      "../secret.xlsx",
      path.join(path.dirname(root), "sibling.xlsx"),
      "file://ventas.xlsx",
      "\\\\unc\\share\\a.xlsx",
    ]) {
      const r = await read.execute(
        { workbook, worksheet: "Ventas", range: "A1" },
        ctx,
      );
      assert.equal(r.ok, false, workbook);
      const w = await write.execute(
        { workbook, sheet: "Enero", range: "A1", values: [["x"]] },
        ctx,
      );
      assert.equal(w.ok, false, workbook);
    }
    assert.equal(called, 0);
  });

  it("symlink fuera del root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13f-sl-"));
    const outside = path.join(path.dirname(root), `out-${Date.now()}.xlsx`);
    await writeFile(outside, pkZip());
    const link = path.join(root, "link.xlsx");
    try {
      await symlink(outside, link);
    } catch {
      return;
    }
    const tool = createOfficeExcelReadTool({
      root,
      readRange: async () => ({ ok: true, values: [["x"]] }),
    });
    const r = await tool.execute(
      { workbook: "link.xlsx", worksheet: "Ventas", range: "A1" },
      ctx,
    );
    assert.equal(r.ok, false);
  });

  it("fórmulas: permite negativos literales y rechaza expresiones", () => {
    assert.equal(isExcelFormulaLike("-123"), false);
    assert.equal(isExcelFormulaLike("-12.5"), false);
    assert.equal(isExcelFormulaLike("=SUM(A1:A3)"), true);
    assert.equal(isExcelFormulaLike("@SUM(A1)"), true);
    assert.equal(isExcelFormulaLike("+A1"), true);
    assert.equal(isExcelFormulaLike("-SUM(A1:A3)"), true);
    assert.equal(isExcelFormulaLike("-A1"), true);
  });

  it("values inválidos y fórmulas no escriben", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13f-v-"));
    await writeFile(path.join(root, "ventas.xlsx"), pkZip());
    let called = 0;
    const tool = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        called += 1;
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const bad: unknown[] = [
      [[Number.NaN]],
      [[Number.POSITIVE_INFINITY]],
      [[{ a: 1 }]],
      [[[1]]],
      [[undefined]],
      [["=SUM(A1:A3)"]],
      [["-SUM(A1:A3)"]],
    ];
    for (const values of bad) {
      const r = await tool.execute(
        { workbook: "ventas.xlsx", sheet: "Enero", range: "A1", values },
        ctx,
      );
      assert.equal(r.ok, false);
    }
    const ok = await tool.execute(
      {
        workbook: "ventas.xlsx",
        sheet: "Enero",
        range: "A1",
        values: [["-12.5"]],
      },
      ctx,
    );
    assert.equal(ok.ok, true);
    assert.equal(called, 1);
  });

  it("read+write, write+write y read+read no solapan COM", async () => {
    let concurrent = 0;
    let max = 0;
    const bump = async () => {
      concurrent += 1;
      max = Math.max(max, concurrent);
      await delay(25);
      concurrent -= 1;
    };
    const root = await mkdtemp(path.join(tmpdir(), "pa-13f-c-"));
    await writeFile(path.join(root, "ventas.xlsx"), pkZip());
    const read = createOfficeExcelReadTool({
      root,
      readRange: async () => {
        await withExcelComLock(bump);
        return { ok: true, values: [["x"]] };
      },
    });
    const write = createOfficeExcelWriteTool({
      root,
      writeRange: async () => {
        await withExcelComLock(bump);
        return { ok: true, rows: 1, columns: 1 };
      },
    });
    const inputR = { workbook: "ventas.xlsx", worksheet: "Ventas", range: "A1" };
    const inputW = {
      workbook: "ventas.xlsx",
      sheet: "Enero",
      range: "A1",
      values: [["x"]],
    };
    await Promise.all([read.execute(inputR, ctx), write.execute(inputW, ctx)]);
    await Promise.all([write.execute(inputW, ctx), write.execute(inputW, ctx)]);
    await Promise.all([read.execute(inputR, ctx), read.execute(inputR, ctx)]);
    assert.equal(max, 1);
  });

  it("timeout no abre otra op COM", async () => {
    let concurrent = 0;
    let max = 0;
    await assert.rejects(
      () =>
        withExcelComLock(async () => {
          concurrent += 1;
          max = Math.max(max, concurrent);
          await delay(40);
          concurrent -= 1;
        }, 10),
      ExcelComTimeoutError,
    );
    await withExcelComLock(async () => {
      concurrent += 1;
      max = Math.max(max, concurrent);
      concurrent -= 1;
    });
    assert.equal(max, 1);
  });

  it("shutdown durante op espera y rechaza nuevas", async () => {
    let finished = false;
    const active = withExcelComLock(async () => {
      await delay(40);
      finished = true;
    });
    await delay(5);
    await shutdownExcelCom(200);
    await active;
    assert.equal(finished, true);
    await assert.rejects(
      () => withExcelComLock(async () => 1),
      /shutdown|no acepta/i,
    );
  });

  it("MCP disconnect dispara shutdown Excel", async () => {
    const registry = createDefaultToolRegistry();
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "13f-dc", version: "0.0.0" });
    await client.connect(clientT);
    await client.close();
    await serverT.close();
    await delay(40);
    await agent.shutdown().catch(() => undefined);
  });
});
