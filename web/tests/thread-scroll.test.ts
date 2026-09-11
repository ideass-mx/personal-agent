import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isScrollNearBottom,
  THREAD_STICK_BOTTOM_PX,
} from "../src/lib/threadScroll.ts";

describe("threadScroll", () => {
  it("detecta cerca del fondo", () => {
    assert.equal(
      isScrollNearBottom({
        scrollHeight: 1000,
        scrollTop: 1000 - 400 - 40,
        clientHeight: 400,
      }),
      true,
    );
    assert.equal(
      isScrollNearBottom({
        scrollHeight: 1000,
        scrollTop: 100,
        clientHeight: 400,
      }),
      false,
    );
  });

  it("umbral por defecto es generoso para lectura", () => {
    assert.ok(THREAD_STICK_BOTTOM_PX >= 64);
  });
});
