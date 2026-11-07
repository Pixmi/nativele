import { HOLE_ANY, holeName } from "./holes.ts";

export type TextValue = string | number | boolean | null | undefined;

export function mountHoles(root: ParentNode): Record<string, TextValue> {
  const nodes = new Map<string, Text[]>();
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = (n as Text).parentElement;
    if (parent && /^(style|script)$/i.test(parent.localName)) continue;
    if ((n as Text).data.includes("{{")) targets.push(n as Text);
  }
  for (const t of targets) {
    const src = t.data;
    const parts: Node[] = [];
    let last = 0;
    for (const m of src.matchAll(HOLE_ANY)) {
      const name = holeName(m[1] ?? "");
      if (!name) continue;
      if (m.index > last) parts.push(document.createTextNode(src.slice(last, m.index)));
      const hole = document.createTextNode("");
      parts.push(hole);
      nodes.set(name, [...(nodes.get(name) ?? []), hole]);
      last = m.index + m[0].length;
    }
    if (last === 0 && parts.length === 0) continue;
    if (last < src.length) parts.push(document.createTextNode(src.slice(last)));
    t.replaceWith(...parts);
  }
  const values = new Map<string, TextValue>();
  const text = {} as Record<string, TextValue>;
  for (const [name, list] of nodes) {
    Object.defineProperty(text, name, {
      enumerable: true,
      get: () => values.get(name),
      set(v: TextValue) {
        values.set(name, v);
        const s = v == null || v === false ? "" : String(v);
        for (const node of list) if (node.data !== s) node.data = s;
      },
    });
  }
  return text;
}
