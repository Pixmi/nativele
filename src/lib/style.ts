/** Limit scoped styles to a tag: use the native @scope when available, otherwise fall back to CSS nesting. */
export function scopeCss(css: string, tag: string): string {
  if (typeof CSSScopeRule !== "undefined") return `@scope (${tag}) {\n${css}\n}`;
  return `${tag} {\n${css.replaceAll(":scope", "&")}\n}`;
}

export interface Sheet {
  css: string;
  scoped: boolean;
}

/** Take the template's top-level <style> elements out of the template (they are removed from it). */
export function extractSheets(content: DocumentFragment): Sheet[] {
  const sheets: Sheet[] = [];
  // children is a live collection and removing from it changes the iteration, so copy it first
  // eslint-disable-next-line unicorn/no-useless-spread
  for (const child of [...content.children]) {
    if (child.localName !== "style") continue;
    sheets.push({ css: child.textContent ?? "", scoped: child.hasAttribute("scoped") });
    child.remove();
  }
  return sheets;
}

/** Inject every stylesheet only once per document. */
export function createInjector(sheets: Sheet[]): (host: HTMLElement) => void {
  const injected = new WeakMap<Document, Set<string>>();
  return (host) => {
    if (!sheets.length) return;
    const doc = host.ownerDocument;
    const done = injected.get(doc) ?? new Set<string>();
    injected.set(doc, done);
    const tag = host.localName;
    for (const [i, { css, scoped }] of sheets.entries()) {
      const key = scoped ? `${tag}#${i}` : `#${i}`;
      if (done.has(key)) continue;
      done.add(key);
      if (!scoped && css.includes(":host")) {
        console.warn(`<${tag}>: [host-in-light-dom] :host has no effect in Light DOM. Fix: select the element by its tag name (${tag} { ... }) or use <style scoped> with :scope, or opt into Shadow DOM with { shadow: true }.`);
      }
      const el = doc.createElement("style");
      el.dataset.tsDom = scoped ? tag : "";
      el.textContent = scoped ? scopeCss(css, tag) : css;
      doc.head.append(el);
    }
  };
}
