# Templates

Part of the [Nativele](../README.md) documentation.

## HTML Syntax

There are only a few kinds of markup, plus one kind of hole.

| Markup | Meaning | TS side |
|---|---|---|
| `data-ref="name"` | Get the element; the type is derived from the tag | `this.refs.name` |
| `data-if="name"` | Conditional block, **hidden by default** (removed from the DOM); shown only when TS says so | `this.show("name", bool)` |
| `<template data-each="name">` | List; the content must be exactly one root element | `this.lists.name` |
| `<slot name="x">` | Slot | The user provides child nodes with `slot="x"` |
| `{{ name }}` | Text hole; the same name may appear in multiple places | `this.text.name = value`, or bound automatically from `state` |
| `data-on-click="method"` | Event: calls the component method of that name (event names must be lowercase) | `method(e, hit)`, see [Events](components.md#events-data-on-) |

Rules for holes:

- A hole must be a single identifier. `{{ data.name }}` and `{{ a + 1 }}` cause an error at codegen time.
- Holes are only for text nodes; they are not supported inside attributes (`title="{{ x }}"` is an error). When needed, get the element with `data-ref` and set it in TS.
- Content inside `<style>` and `<script>` is not treated as holes.
- A value of `null`, `undefined`, or `false` is displayed as an empty string.

A hidden `data-if` block is kept in memory, not destroyed: `refs` and holes inside it stay usable while it is hidden, so you can fill a form before showing it, and showing it again puts back the same elements with their state.

## How Types Are Generated

Next to each `x.html`, an `x.html.ts` is generated (already added to `.gitignore`; a `ts-dom-tags.ts` is generated as well, see [Composition](components.md#composition-using-multiple-components-together)). It is a real TS module that contains both the parsed markup of this template (as data that the runtime turns into DOM nodes with DOM calls, so no HTML string is parsed in the browser) and its schema, so `tsc` can compile and check it directly.

```ts
// user-card.html.ts (auto-generated)
import { template } from "@nativele/ts-dom";
import type { El } from "@nativele/ts-dom";
export default template<{
  refs: { "toggle": El<"button"> };
  lists: { "tags": { refs: {}; text: "label"; ifs: "hot" } };
  ifs: "admin";
  slots: "extra";
  text: "name";
}>([["h2", {}, ["Hello, {{ name }}!"]], /* ... */]);
```

Whole-page documents are page entry points, not templates, and are not processed. A file is a page when its content starts with `<!doctype html>` or `<html>` (comments before it are fine); the file name does not matter, so `index.html`, `main.html` and `login.html` all work. A template is a fragment of a component, so `<html>`, `<head>` and `<body>` are rejected in it (rule `document-tag`): the browser would drop them from the fragment and whatever you put on them would have no effect. To keep a file out of generation in another way, use `--exclude`.

## Templates Without a Component

`tpl.instantiate()` builds a template without a custom element and returns the same typed handles a component has: `root` (a `DocumentFragment`), `refs`, `lists`, `text` and `show`. Use it for small pieces created in code, such as a menu item added to a list:

```ts
import itemTpl from "./menu-item.html.js";

function menuItem(label: string): HTMLLIElement {
  const view = itemTpl.instantiate();
  view.text.label = label;
  view.refs.button.addEventListener("click", () => select(label));
  return view.rootElement; // typed by the template's top-level tag
}
```

`rootElement` is the template's only top-level element (a top-level `<style>` does not count); it exists in the type only when the template has exactly one, so a template that later gains a second root element makes `tsc` report the use.

There is no host element, so `data-on-*` attributes do nothing here (listen on `refs`) and `<slot>` is not projected; use a component when you need those.

## Trusted Types, Translations and Icons

- Trusted Types: pages that enforce `require-trusted-types-for 'script'` work with no policy, because `ts-dom gen` writes the markup as data and the runtime builds it with DOM calls. Your own code must avoid `innerHTML` too.
- Translations: ts-dom has no i18n. Write the translated string into a hole, `this.text.title = t("title")`, or into `render()` for attributes; the HTML stays free of words if you want it that way.
- Icons: ts-dom does not manage icons. Make an icon a custom element of your own that builds its SVG with `createElementNS` from whatever source you use, and place it in a template as a child component:

```html
<app-icon name="send" class="size-4"></app-icon>
```

- Reordering: a keyed list (`data-each`) moves its items with `moveBefore` where the browser has it, and every component accepts the move without being disconnected, so a moved item keeps its focus, scroll position and subscriptions.
