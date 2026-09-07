/**
 * PHASE 58.4 — composer Enter/Shift+Enter + autosize helpers (54–240).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPOSER_TEXTAREA_MAX_PX,
  COMPOSER_TEXTAREA_MIN_PX,
  applyComposerAutosize,
  composerEnterShouldSend,
} from "../src/lib/composerKeyboard.ts";

/** Fake textarea: height puede ser `'auto'`; scrollHeight es mutable. */
function fakeTextarea(initialScrollHeight: number): HTMLTextAreaElement & {
  setScrollHeight: (n: number) => void;
} {
  let scrollHeight = initialScrollHeight;
  const style: Record<string, string> = {};
  return {
    get scrollHeight() {
      return scrollHeight;
    },
    setScrollHeight(n: number) {
      scrollHeight = n;
    },
    style: {
      set height(v: string) {
        style.height = v;
      },
      get height() {
        return style.height ?? "";
      },
      set overflowY(v: string) {
        style.overflowY = v;
      },
      get overflowY() {
        return style.overflowY ?? "";
      },
    },
  } as unknown as HTMLTextAreaElement & { setScrollHeight: (n: number) => void };
}

describe("PHASE 58.4 composer multiline helpers", () => {
  it("constants are 54 / 240", () => {
    assert.equal(COMPOSER_TEXTAREA_MIN_PX, 54);
    assert.equal(COMPOSER_TEXTAREA_MAX_PX, 240);
  });

  it("Enter without shift sends", () => {
    assert.equal(composerEnterShouldSend({ shiftKey: false }), true);
  });

  it("Shift+Enter does not send", () => {
    assert.equal(composerEnterShouldSend({ shiftKey: true }), false);
  });

  it("coarse pointer does not send on Enter", () => {
    assert.equal(
      composerEnterShouldSend({ shiftKey: false, coarsePointer: true }),
      false,
    );
  });

  it("autosize respects min height 54", () => {
    const el = fakeTextarea(20);
    const result = applyComposerAutosize(el);
    assert.equal(result.contentPx, 20);
    assert.equal(result.heightPx, 54);
    assert.equal(result.heightPx, COMPOSER_TEXTAREA_MIN_PX);
    assert.equal(result.overflowY, "hidden");
    assert.equal(el.style.height, "54px");
    // height=auto debe poder asignarse (medición previa al clamp).
    el.style.height = "auto";
    assert.equal(el.style.height, "auto");
  });

  it("autosize mid grows between min and max", () => {
    const mid = 120;
    const el = fakeTextarea(mid);
    const result = applyComposerAutosize(el);
    assert.equal(result.contentPx, mid);
    assert.equal(result.heightPx, mid);
    assert.equal(result.overflowY, "hidden");
    assert.equal(el.style.height, `${mid}px`);
  });

  it("autosize caps at max and sets overflow auto", () => {
    const el = fakeTextarea(COMPOSER_TEXTAREA_MAX_PX + 80);
    const result = applyComposerAutosize(el);
    assert.equal(result.contentPx, COMPOSER_TEXTAREA_MAX_PX + 80);
    assert.equal(result.heightPx, COMPOSER_TEXTAREA_MAX_PX);
    assert.equal(result.overflowY, "auto");
    assert.equal(el.style.height, `${COMPOSER_TEXTAREA_MAX_PX}px`);
    assert.equal(el.style.overflowY, "auto");
  });

  it("grow then shrink sequence reduces height on delete", () => {
    const el = fakeTextarea(20);

    let r = applyComposerAutosize(el);
    assert.equal(r.contentPx, 20);
    assert.equal(r.heightPx, 54);
    assert.equal(r.overflowY, "hidden");

    el.setScrollHeight(120);
    r = applyComposerAutosize(el);
    assert.equal(r.contentPx, 120);
    assert.equal(r.heightPx, 120);
    assert.equal(r.overflowY, "hidden");

    el.setScrollHeight(300);
    r = applyComposerAutosize(el);
    assert.equal(r.contentPx, 300);
    assert.equal(r.heightPx, 240);
    assert.equal(r.overflowY, "auto");

    el.setScrollHeight(80);
    r = applyComposerAutosize(el);
    assert.equal(r.contentPx, 80);
    assert.equal(r.heightPx, 80);
    assert.equal(r.overflowY, "hidden");
    assert.equal(el.style.height, "80px");
  });
});
