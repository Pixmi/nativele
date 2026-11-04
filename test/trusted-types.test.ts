import { afterEach, describe, expect, it, vi } from "vitest";
import { Component, define } from "../src/lib/index.ts";
import tpl from "./light.html.js";

describe("Trusted Types", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds a template without parsing any HTML string", () => {
    const sinks = [
      vi.spyOn(Element.prototype, "innerHTML", "set"),
      vi.spyOn(Element.prototype, "insertAdjacentHTML"),
      vi.spyOn(DOMParser.prototype, "parseFromString"),
    ];
    class TtCard extends Component(tpl, { state: { title: "Hi" } }) {}
    define("tt-card", TtCard);
    const el = document.createElement("tt-card");
    document.body.append(el);
    expect(el.querySelector("h1")?.textContent).toBe("Hi");
    for (const sink of sinks) expect(sink).not.toHaveBeenCalled();
  });
});
