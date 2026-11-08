// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { openPage } from "./server.ts";

let page: Page;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ page, close } = await openPage({ path: "/browser/fixtures/page.html", ready: "light-card" }));
}, 60_000);

afterAll(() => close());

describe("Events that do not bubble (real Chrome)", () => {
  it("media and dialog events reach data-on-* handlers", async () => {
    const seen = await page.evaluate(() => {
      const box = document.createElement("media-box") as HTMLElement & { seen: string[]; refs: { video: HTMLElement; dialog: HTMLElement } };
      document.body.append(box);
      box.refs.video.dispatchEvent(new Event("canplay"));
      box.refs.dialog.dispatchEvent(new Event("close"));
      return box.seen;
    });
    expect(seen).toEqual(["canplay", "close"]);
  });
});

describe("Events with no on<name> property on HTMLElement (real Chrome)", () => {
  it("focusin, focusout and touchstart are delegated in the bubble phase, so a stopPropagation below the handler is respected", async () => {
    const seen = await page.evaluate(() => {
      const box = document.createElement("media-box") as HTMLElement & { seen: string[]; refs: { field: HTMLInputElement } };
      document.body.append(box);
      const { field } = box.refs;
      const touch = () => field.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
      field.focus();
      field.blur();
      touch();
      for (const type of ["focusin", "focusout", "touchstart"]) field.addEventListener(type, (e) => e.stopPropagation());
      field.focus();
      field.blur();
      touch();
      return box.seen;
    });
    expect(seen).toEqual(["focusin", "focusout", "touchstart"]);
  });
});
