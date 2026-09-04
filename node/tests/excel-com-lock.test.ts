import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ExcelComShutdownError,
  ExcelComTimeoutError,
  resetExcelComLockForTests,
  shutdownExcelCom,
  withExcelComLock,
} from "../src/tools/excel-com-lock.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  resetExcelComLockForTests();
});

describe("13D.2 Excel COM lock", () => {
  it("serializa dos operaciones", async () => {
    let concurrent = 0;
    let max = 0;
    const run = async () => {
      await withExcelComLock(async () => {
        concurrent += 1;
        max = Math.max(max, concurrent);
        await delay(30);
        concurrent -= 1;
      });
    };
    await Promise.all([run(), run()]);
    assert.equal(max, 1);
  });

  it("si A falla, B aún corre y el lock se libera", async () => {
    await assert.rejects(
      () =>
        withExcelComLock(async () => {
          throw new Error("boom");
        }),
      /boom/,
    );
    const value = await withExcelComLock(async () => 7);
    assert.equal(value, 7);
  });

  it("timeout libera el lock tras terminar COM (sin solapar)", async () => {
    let concurrent = 0;
    let max = 0;
    await assert.rejects(
      () =>
        withExcelComLock(async () => {
          concurrent += 1;
          max = Math.max(max, concurrent);
          await delay(50);
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

  it("shutdown espera la op activa y rechaza las nuevas", async () => {
    let finished = false;
    const active = withExcelComLock(async () => {
      await delay(40);
      finished = true;
      return 1;
    });
    await delay(5);
    const stopping = shutdownExcelCom(200);
    await assert.rejects(
      () => withExcelComLock(async () => 2),
      ExcelComShutdownError,
    );
    await active;
    await stopping;
    assert.equal(finished, true);
    await assert.rejects(
      () => withExcelComLock(async () => 3),
      ExcelComShutdownError,
    );
  });
});
