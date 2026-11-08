import { describe, expect, it } from "vitest";
import { Component, define, event } from "../src/lib/index.ts";
import type { EventHit } from "../src/lib/index.ts";
import rowTpl from "./bind-row.html.js";
import listTpl from "./bind-list.html.js";

interface Todo {
  id: number;
  title: string;
}

export class BindRow extends Component(rowTpl, {
  props: { todo: null as Todo | null },
  derive: { title: (s) => s.todo?.title ?? "" },
  emits: { toggled: event<void>() },
}) {
  renders = 0;
  titleWhenConnected: string | undefined;
  override connected(): void {
    this.titleWhenConnected ??= this.props.todo?.title;
  }
  override render(): void {
    this.renders++;
  }
  toggle(): void {
    this.emit("toggled");
  }
}
define("t-bind-row", BindRow);

class BindList extends Component(listTpl) {
  toggled: PropertyKey[] = [];
  onToggled(_e: Event, hit: EventHit): void {
    this.toggled.push(hit.key as PropertyKey);
  }
}
define("t-bind-list", BindList);

const mount = () => {
  const list = document.createElement("t-bind-list") as BindList;
  document.body.append(list);
  return list;
};
const rows = (list: BindList) => [...list.querySelectorAll<BindRow>("t-bind-row")];

describe("list items assignment (data-key and data-prop)", () => {
  it("shows the items, keeps the element of a key that stays and removes the rest", () => {
    const list = mount();
    const a = { id: 1, title: "a" };
    const b = { id: 2, title: "b" };
    list.lists.todos.items = [a, b];
    const [rowA, rowB] = rows(list);
    expect(rows(list).map((r) => r.textContent?.trim().split("\n")[0])).toEqual(["a", "b"]);

    list.lists.todos.items = [b, { id: 3, title: "c" }];
    expect(rows(list)).toHaveLength(2);
    expect(rows(list)[0]).toBe(rowB);
    expect(rowA?.isConnected).toBe(false);
    expect(list.lists.todos.items).toHaveLength(2);
  });

  it("sets the prop of a new item before it is connected, so the item component starts with its item", () => {
    const list = mount();
    list.lists.todos.items = [{ id: 1, title: "a" }, { id: 2, title: "b" }];
    expect(rows(list).map((r) => r.titleWhenConnected)).toEqual(["a", "b"]);
    expect(rows(list).map((r) => r.renders)).toEqual([1, 1]);
  });

  it("assigns only the items that are not the same object as before", () => {
    const list = mount();
    const a = { id: 1, title: "a" };
    const b = { id: 2, title: "b" };
    list.lists.todos.items = [a, b];
    const before = rows(list).map((r) => r.renders);
    list.lists.todos.items = [a, { id: 2, title: "b2" }];
    const after = rows(list).map((r) => r.renders);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBeGreaterThan(before[1] as number);
    expect(rows(list)[1]?.textContent).toContain("b2");
  });

  it("an event from an item reaches the parent with the item's key", () => {
    const list = mount();
    list.lists.todos.items = [{ id: 7, title: "x" }];
    rows(list)[0]?.querySelector("button")?.click();
    expect(list.toggled).toEqual([7]);
  });

  it("reports an item without a key, a duplicate key, and a list that is not bound", () => {
    const list = mount();
    // @ts-expect-error the item has no id (data-key)
    expect(() => (list.lists.todos.items = [{ title: "no id" }])).toThrow(/missing-key/);
    expect(() => (list.lists.todos.items = [{ id: 1, title: "a" }, { id: 1, title: "b" }])).toThrow(/duplicate-key/);
    expect(() => (list.lists.plain.items = [])).toThrow(/list-not-bound/);
  });

  it("rejects a value that is not an array, an item that is not an object, and a key that is not a string or number", () => {
    const list = mount();
    const bad = (value: unknown): (() => void) => () => {
      (list.lists.todos as unknown as { items: unknown }).items = value;
    };
    expect(bad(undefined)).toThrow(/invalid-items.*undefined/);
    expect(bad(null)).toThrow(/invalid-items.*null/);
    expect(bad("abc")).toThrow(/invalid-items.*string/);
    expect(bad(["x"])).toThrow(/invalid-item\b.*string/);
    expect(bad([null])).toThrow(/invalid-item\b.*null/);
    expect(bad([{ id: Symbol("k"), title: "s" }])).toThrow(/missing-key.*symbol/);
    expect(bad([{ id: undefined, title: "u" }])).toThrow(/missing-key.*missing/);
    const rejected = (): void => {
      // @ts-expect-error a key must be a string or a number
      list.lists.todos.items = [{ id: Symbol("k"), title: "s" }];
    };
    expect(rejected).toBeTypeOf("function");
  });

  it("reading items follows the elements, even after remove() or replace()", () => {
    const list = mount();
    const a = { id: 1, title: "a" };
    const b = { id: 2, title: "b" };
    list.lists.todos.items = [a, b];
    list.lists.todos.remove(1);
    expect(list.lists.todos.items).toEqual([b]);
    list.lists.todos.items = [b, a];
    expect(list.lists.todos.items).toEqual([b, a]);
  });

  it("a failed update does not mark the item as shown, so assigning the same objects again retries", () => {
    const list = mount();
    const a = { id: 1, title: "a" };
    let fail = true;
    const original = list.lists.todos.replace.bind(list.lists.todos);
    expect(() =>
      original([a], (i) => (i as Todo).id, () => {
        if (fail) throw new Error("boom");
      }),
    ).toThrow("boom");
    fail = false;
    list.lists.todos.items = [a];
    expect(rows(list)[0]?.textContent).toContain("a");
  });

  it("tsc checks the items against the item component's property and the data-key field", () => {
    const list = mount();
    const ok: readonly Todo[] = [{ id: 1, title: "a" }];
    list.lists.todos.items = ok;
    const shown: readonly Todo[] = list.lists.todos.items;
    expect(shown).toHaveLength(1);
    const rejected = (): void => {
      // @ts-expect-error title must be a string, as the item component declares
      list.lists.todos.items = [{ id: 1, title: 5 }];
      // @ts-expect-error a list of plain elements has no items to assign
      list.lists.plain.items = [{ n: "x" }];
    };
    expect(rejected).toBeTypeOf("function");
  });

  it("replace() still works on any list", () => {
    const list = mount();
    list.lists.plain.replace(["x", "y"], (s) => s, (s, { text }) => (text.n = s));
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["x", "y"]);
  });
});

import paddedTpl from "./bind-padded.html.js";

class PaddedList extends Component(paddedTpl) {}
define("t-padded-list", PaddedList);
class ShadowPaddedList extends Component(paddedTpl, { shadow: true }) {}
define("t-shadow-padded-list", ShadowPaddedList);

describe("data-key and data-prop values", () => {
  it("ignore surrounding spaces", () => {
    const list = document.createElement("t-padded-list") as PaddedList;
    document.body.append(list);
    list.lists.good.items = [{ id: 1, title: "a" }];
    expect(list.querySelectorAll("t-bind-row")).toHaveLength(1);
  });

  it("report a property the item component does not have, connected or not", () => {
    const connected = document.createElement("t-padded-list") as PaddedList;
    document.body.append(connected);
    // @ts-expect-error the item component has no "nope" property (data-prop)
    expect(() => (connected.lists.rows.items = [{ id: 1 }])).toThrow(/item-prop-missing/);
    expect(connected.querySelectorAll("t-bind-row")).toHaveLength(0);
    const loose = document.createElement("t-shadow-padded-list") as ShadowPaddedList;
    expect(loose.isConnected).toBe(false);
    // @ts-expect-error the item component has no "nope" property (data-prop)
    expect(() => (loose.lists.rows.items = [{ id: 1 }])).toThrow(/item-prop-missing/);
  });
});

import unmappedTpl from "./bind-unmapped.html.js";

describe("an item component that is not in HTMLElementTagNameMap", () => {
  it("accepts any item that has the data-key field", () => {
    const view = unmappedTpl.instantiate();
    const ok = (): void => {
      view.lists.rows.items = [{ id: 1, anything: true }];
      // @ts-expect-error the data-key field is still required
      view.lists.rows.items = [{ anything: true }];
    };
    expect(ok).toBeTypeOf("function");
  });
});

import { template } from "../src/lib/index.ts";

const itemList = <S extends "local" | "unexported" | "external">() =>
  template<{
    refs: Record<never, never>;
    lists: { rows: { refs: Record<never, never>; text: never; ifs: never; item: { tag: "x-not-in-map"; prop: "row"; key: "id"; source: S } } };
    ifs: never;
    slots: never;
    rootElement: never;
    text: never;
    events: never;
  }>([]);

describe("item components that tsc cannot see", () => {
  it("a component defined in a scanned folder but missing from the tag map, or not exported, is a type error; one from elsewhere only needs the key", () => {
    const local = itemList<"local">().instantiate();
    const unexported = itemList<"unexported">().instantiate();
    const external = itemList<"external">().instantiate();
    const checks = (): void => {
      // @ts-expect-error the component is defined here, so a missing tag map entry means ts-dom gen has to run
      local.lists.rows.items = [{ id: 1 }];
      // @ts-expect-error the class passed to define() is not exported, so its prop type cannot be read
      unexported.lists.rows.items = [{ id: 1 }];
      external.lists.rows.items = [{ id: 1, anything: true }];
    };
    expect(checks).toBeTypeOf("function");
  });
});

describe("codegen marks where the item component comes from", () => {
  it("local, unexported or external", async () => {
    const { generateModule } = await import("../src/lib/codegen.ts");
    const html = `<template data-each="rows" data-key="id" data-prop="row"><x-row></x-row></template>`;
    const def = (exported: boolean) => [{ tag: "x-row", className: "Row", file: "row.ts", classFile: "row.ts", exported, isDefault: false }];
    expect(generateModule(html, {}, [], def(true))).toContain(`source: "local"`);
    expect(generateModule(html, {}, [], def(false))).toContain(`source: "unexported"`);
    expect(generateModule(html)).toContain(`source: "external"`);
  });
});
