import { anchorSlot, fromTemplate } from "./slots.ts";
interface Cond {
  el: Element;
  anchor: Comment;
}

export interface Conds {
  /** The data-if names that appear in the template */
  names: ReadonlySet<string>;
  show(name: string, on: boolean): void;
  /** Hide everything (the default state: nothing is shown until TypeScript says so) */
  hideAll(): void;
}

/** Collect the data-if elements of a subtree, leaving a comment as placeholder. */
export function mountConds(root: ParentNode): Conds {
  const map = new Map<string, Cond[]>();
  for (const el of root.querySelectorAll("[data-if]")) {
    const name = el.getAttribute("data-if") as string;
    const anchor = document.createComment(`if:${name}`);
    anchorSlot.set(anchor, el.getAttribute("slot") ?? "");
    el.before(anchor);
    map.set(name, [...(map.get(name) ?? []), { el, anchor }]);
  }
  const show = (name: string, on: boolean): void => {
    for (const { el, anchor } of map.get(name) ?? []) {
      if (on) {
        if (!el.isConnected && el.parentNode === null) {
          fromTemplate.add(el);
          anchor.after(el);
        }
      } else el.remove();
    }
  };
  return {
    names: new Set(map.keys()),
    show,
    hideAll() {
      for (const name of map.keys()) show(name, false);
    },
  };
}
