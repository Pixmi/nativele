const slotted = (...user: string[]) => ["<!--slot:-->", ...user, "<!--/slot:-->"];
const mixedHead = ["h2:head", "<!--if:msg-->", "<!--slot:x-->", "<!--each:rows-->", "<!--/slot:x-->"];

/** What each scenario in scenarios.ts returns; shared by the happy-dom and the real-browser tests. */
export const expected = {
  "no slot: an item added after the first render stays": ["r1", "r2", "r3"],
  "list first in the template: an item added after the first render stays": ["r1", "r2", "r3"],
  "empty first render, items added later": ["r1", "r2"],
  "no state: replace() and upsert() after connect": ["r1", "r2", "r9"],
  "reorder after the first render keeps every item, the same nodes, in the new order": { items: ["r3", "r2", "r1"], same: true },
  "default slot: items stay at the list, only user nodes are assigned, no slotchange from items": {
    layoutAfterAdd: ["h2:head", "p:r1", "p:r2", "p:r3", "<!--each:rows-->", ...slotted("u:U")],
    layout: ["h2:head", "p:r3", "p:r1", "<!--each:rows-->", ...slotted("u:U")],
    assigned: ["U"],
    changes: [],
  },
  "named slot: items stay at the list and are not assigned": {
    layout: ["h2:head", "p:r1", "p:r2", "<!--each:rows-->", "<!--slot:x-->", "b:X", "<!--/slot:x-->"],
    assigned: ["X"],
    changes: [],
  },
  "keyed component list: items = after the first render": ["r2", "r1", "r3"],
  "added while disconnected, then reconnected, added and reordered": { reconnected: ["r1", "r2"], after: ["r3", "r2", "r1"] },
  "added, then the host removed in the same task": { detached: ["r1", "r2"], reconnected: ["r1", "r2"] },
  "top-level slot: fallback comes back unassigned and leaves again": {
    removed: { layout: ["h2:head", ...slotted("fallback")], assigned: [], changes: [""] },
    readded: { layout: ["h2:head", ...slotted("b:U")], assigned: ["U"] },
  },
  "an assigned node moved to another parent is unassigned": { assigned: [], changes: [""], layout: ["h2:head", "<!--each:rows-->", ...slotted()] },
  "top-level data-if shown, hidden and shown again": { shown: ["msg"], hidden: [], again: ["msg"] },
  "top-level text hole": ["World", "h2:head"],
  "list inside a top-level data-if": ["r1", "r2", "r3"],
  "an assigned node removed and appended back in the same task stays in its slot": {
    backAtTheEnd: { layout: ["h2:head", "<!--each:rows-->", ...slotted("u:B", "u:A")], assigned: ["B", "A"], changes: [""] },
    sameOrder: { layout: ["h2:head", "<!--each:rows-->", ...slotted("u:B", "u:A")], assigned: ["B", "A"], changes: [] },
  },
  "a child appended while the element is disconnected is slotted when it is connected again": {
    template: { layout: ["h2:head", "<!--each:rows-->", ...slotted("u:P"), "<!--if:on-->"], assigned: ["P"], changes: [""] },
    given: { layout: ["h2:head", "<!--each:rows-->", ...slotted("u:G")], assigned: ["G"], changes: [""] },
  },
  "a hidden data-if in a slot fallback stays hidden when the fallback comes back": {
    hidden: { layout: [...mixedHead, ...slotted("fallback", "<!--if:note-->")], x: [], assigned: [], changes: [""] },
    shown: { layout: [...mixedHead, ...slotted("fallback", "<!--if:note-->", "i:note")], x: [], assigned: [], changes: [] },
    assigned: { layout: [...mixedHead, ...slotted("u:U")], x: [], assigned: ["U"], changes: [""] },
    back: { layout: [...mixedHead, ...slotted("fallback", "<!--if:note-->", "i:note")], x: [], assigned: [], changes: [""] },
  },
  "list items in a slot fallback leave with the fallback and come back with it": {
    first: { layout: ["h2:head", "<!--if:msg-->", "<!--slot:x-->", "p:r1", "<!--each:rows-->", "<!--/slot:x-->", ...slotted("fallback", "<!--if:note-->")], x: [], assigned: [], changes: ["x"] },
    filled: { layout: ["h2:head", "<!--if:msg-->", "<!--slot:x-->", "b:X", "<!--/slot:x-->", ...slotted("fallback", "<!--if:note-->")], x: ["X"], assigned: [], changes: ["x"] },
    back: { layout: ["h2:head", "<!--if:msg-->", "<!--slot:x-->", "p:r1", "p:r2", "<!--each:rows-->", "<!--/slot:x-->", ...slotted("fallback", "<!--if:note-->")], x: [], assigned: [], changes: ["x"] },
  },
  "the template's own top-level nodes are never assigned: text hole, data-if block and slot comments": {
    shown: { layout: ["T", "h2:head", "<!--if:msg-->", "p:msg", "<!--slot:x-->", "b:X", "<!--/slot:x-->", ...slotted("u:U")], x: ["X"], assigned: ["U"], changes: [] },
    hidden: { layout: ["T", "h2:head", "<!--if:msg-->", "<!--slot:x-->", "b:X", "<!--/slot:x-->", ...slotted("u:U")], x: ["X"], assigned: ["U"], changes: [] },
  },
  "a node code appends after the element was built stays where it was put, unassigned, and warns once per tag": {
    result: {
      a: { layout: ["h2:head", "<!--each:rows-->", ...slotted(), "u:A"], assigned: [], changes: [] },
      b: { layout: ["u:B", "h2:head", "<!--each:rows-->", ...slotted()], assigned: [], changes: [] },
    },
    warnings: ["<tl-foreign>: [unplaced-child]"],
  },
  "a parent template's data-if inside the tag, shown after the element was built, lands in its slot and fires slotchange": {
    before: { layout: ["h2:head", "<!--each:rows-->", ...slotted(), "<!--if:on-->"], assigned: [], changes: [] },
    shown: { layout: ["h2:head", "<!--each:rows-->", ...slotted("u:P"), "<!--if:on-->"], assigned: ["P"], changes: [""] },
    hidden: { layout: ["h2:head", "<!--each:rows-->", ...slotted(), "<!--if:on-->"], assigned: [], changes: [""] },
  },
  "a parent template's data-each inside the tag puts its items into the slot their slot attribute names": {
    first: {
      e: { layout: ["h2:head", "<!--each:rows-->", ...slotted("i:r1", "i:r2"), "<!--each:rows-->"], assigned: ["r1", "r2"], changes: [] },
      n: { layout: ["h2:head", "<!--each:rows-->", "<!--slot:x-->", "b:r3", "<!--/slot:x-->", "<!--each:named-->"], x: ["r3"], changes: [] },
    },
    after: {
      e: { layout: ["h2:head", "<!--each:rows-->", ...slotted("i:r2", "i:r4", "i:r1"), "<!--each:rows-->"], assigned: ["r2", "r4", "r1"], changes: [""] },
      n: { layout: ["h2:head", "<!--each:rows-->", "<!--slot:x-->", "<!--/slot:x-->", "<!--each:named-->"], x: [], changes: ["x"] },
    },
  },
};

export type ScenarioName = keyof typeof expected;
