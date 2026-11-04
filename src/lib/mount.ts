import { mountConds } from "./cond.ts";
import type { Conds } from "./cond.ts";
import { List } from "./list.ts";
import { mountHoles } from "./text.ts";
import type { TextValue } from "./text.ts";

export interface Mounted {
  refs: Record<string, Element>;
  lists: Record<string, List>;
  text: Record<string, TextValue>;
  conds: Conds;
}

/**
 * Wire up a built template: `data-each` lists, `data-ref` elements, `data-if` conditions and `{{ }}` holes.
 * Conditions stay where they are until the caller runs `conds.hideAll()`, so a caller that still moves nodes around (slots) can do that first.
 */
export function mountTemplate(frag: DocumentFragment, onItem?: (el: Element) => void): Mounted {
  const lists: Record<string, List> = {};
  for (const t of frag.querySelectorAll<HTMLTemplateElement>("template[data-each]")) {
    const name = t.getAttribute("data-each") as string;
    const proto = t.content.firstElementChild;
    if (!proto) throw new Error(`[each-root-count] data-each="${name}" needs exactly one root element. Fix: wrap the item content in a single element such as <li>.`);
    const anchor = document.createComment(`each:${name}`);
    t.replaceWith(anchor);
    const key = t.getAttribute("data-key");
    const prop = t.getAttribute("data-prop");
    lists[name] = new List(anchor, proto, onItem, key && prop ? { key, prop } : undefined);
  }
  const refs: Record<string, Element> = {};
  for (const el of frag.querySelectorAll("[data-ref]")) refs[el.getAttribute("data-ref") as string] = el;
  return { refs, lists, text: mountHoles(frag), conds: mountConds(frag) };
}
