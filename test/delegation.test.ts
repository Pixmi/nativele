import { describe, expect, it } from "vitest";
import { Component, define, event } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./delegation.html.js";

class Delegation extends Component(tpl) {
  seen: string[] = [];
  hit(e: Event, { el }: EventHit): void {
    this.seen.push(`${el.localName}:${e.type}`);
  }
}
define("t-delegation", Delegation);

const make = () => document.body.appendChild(document.createElement("t-delegation") as Delegation);

describe("event delegation follows whether each dispatch bubbles", () => {
  for (const type of ["focusin", "touchstart", "closed"]) {
    it(`a bubbling ${type} reaches the outer handler, and a stopPropagation below it is respected`, () => {
      const d = make();
      d.refs.field.dispatchEvent(new Event(type, { bubbles: true }));
      d.refs.field.addEventListener(type, (e) => e.stopPropagation());
      d.refs.field.dispatchEvent(new Event(type, { bubbles: true }));
      expect(d.seen).toEqual([`div:${type}`]);
    });
  }
  it("a non-bubbling event reaches only the handler on its target", () => {
    const d = make();
    d.refs.field.dispatchEvent(new Event("focus"));
    d.refs.field.dispatchEvent(new Event("ping"));
    d.refs.box.dispatchEvent(new Event("ping"));
    expect(d.seen).toEqual(["input:focus", "div:ping"]);
  });
});

describe("emits named like a native event", () => {
  it("focusin, focusout, compositionstart, touchstart and touchcancel are rejected whether or not the browser has an on<name> property", () => {
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { focusin: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { focusout: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { compositionstart: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { touchstart: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { touchcancel: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
  });
});
