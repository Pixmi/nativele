import { describe, expect, it } from "vitest";
import { generateModule } from "../src/lib/codegen.ts";
import itemTpl from "./root-item.html.js";
import rowsTpl from "./list.html.js";

describe("instantiate().rootElement", () => {
  it("is the template's only top-level element, typed by its tag", () => {
    const view = itemTpl.instantiate();
    const li: HTMLLIElement = view.rootElement;
    expect(li.localName).toBe("li");
    expect(li.querySelector("span")).toBe(view.refs.label);
    expect(view.root.firstElementChild).toBe(li);
  });

  it("is not available on a template with several top-level elements", () => {
    const view = rowsTpl.instantiate();
    // @ts-expect-error list.html has two top-level elements, so there is no rootElement
    expect(view.rootElement).toBeUndefined();
  });

  it("generates the root type only for exactly one top-level element", () => {
    expect(generateModule(`<li></li>`)).toContain(`rootElement: El<"li">`);
    expect(generateModule(`<style>a{}</style>\n<li></li>`)).toContain(`rootElement: El<"li">`);
    expect(generateModule(`<li></li><li></li>`)).toContain(`rootElement: never`);
    expect(generateModule(`text<li></li>`)).toContain(`rootElement: never`);
    expect(generateModule(`<template data-each="a"><i></i></template>`)).toContain(`rootElement: never`);
    expect(generateModule(`<svg></svg>`)).toContain(`rootElement: SVGElement`);
  });
});
