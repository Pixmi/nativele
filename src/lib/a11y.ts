import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Diagnostic } from "./codegen.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Template = DefaultTreeAdapterMap["template"];

export interface A11yDiagnostic extends Diagnostic {
  rule: string;
}

/** Every check, by rule id (usable in `ignore`). The text is the default message: what is wrong and how to fix it. */
export const A11Y_RULES = {
  "img-alt": "<img> has no alt attribute, so screen readers cannot describe it. Fix: add alt=\"description\", or alt=\"\" if the image is purely decorative.",
  "control-name": "This control has no accessible name. Fix: add text, a {{ hole }}, a <slot>, aria-label or aria-labelledby.",
  "form-label": "This form control has no label. Fix: wrap it in a <label>, add <label for=\"id\">, or add aria-label.",
  "iframe-title": "<iframe> has no title. Fix: add a title attribute (or aria-label) that describes its content.",
  "dialog-name": "<dialog> has no accessible name. Fix: add aria-label or aria-labelledby.",
  "heading-empty": "This heading is empty. Fix: add text or a {{ hole }}, or remove the heading element.",
  "aria-role": "This role is not a valid ARIA role. Fix: use a role from the WAI-ARIA specification (check the spelling).",
  "aria-attr": "This is not a valid ARIA attribute. Fix: check the spelling against the WAI-ARIA attribute list.",
  "role-tabindex": "An element with an interactive role must be focusable. Fix: add tabindex=\"0\" (and handle keyboard events), or use a native element such as <button>.",
  "tabindex-positive": "A positive tabindex disturbs the natural focus order. Fix: use tabindex=\"0\" or \"-1\".",
  "hidden-focusable": "A focusable element has aria-hidden=\"true\", so keyboard users can reach something screen readers cannot see. Fix: remove aria-hidden, or make the element non-focusable.",
  "label-for": "<label for> points to an id that does not exist in this template. Fix: add the matching id to the control, or wrap the control in the label instead.",
  "id-in-list": "An id inside a data-each template is repeated for every item. Fix: use data-ref or a class instead of an id.",
  "duplicate-id": "This id is used more than once in the template. Fix: make every id unique.",
  "aria-idref": "This ARIA attribute refers to an id that does not exist in this template. Fix: add the id, or ignore this rule if it refers to an element outside the component.",
  "heading-order": "Heading levels are skipped. Fix: do not jump levels (for example h1 straight to h3); use the next level down.",
  "table-header": "<table> has no <th> header cells. Fix: add <th> cells, or set role=\"presentation\" if the table is only used for layout.",
  "list-structure": "Invalid list structure. Fix: <ul>/<ol> may only contain <li> (or a custom element with role=\"listitem\"), and <li> must be inside <ul>, <ol> or <menu>.",
  "landmark-label": "There are several landmarks of the same kind. Fix: give each <nav> / <aside> a distinct aria-label.",
  "redundant-role": "The role repeats the element's native role. Fix: remove the role attribute.",
  "click-semantics": "data-on-click is on an element that is not natively operable, so keyboard and assistive technology users cannot use it. Fix: use <button> or <a href>, or add an interactive role plus tabindex and keyboard handling.",
} as const;
export type A11yRule = keyof typeof A11Y_RULES;

const ROLES = new Set(
  `alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem`.split(
    " ",
  ),
);
const ARIA_ATTRS = new Set(
  `activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext`
    .split(" ")
    .map((n) => `aria-${n}`),
);
const INTERACTIVE_ROLES = new Set(
  "button link checkbox switch tab menuitem menuitemcheckbox menuitemradio option radio textbox combobox slider spinbutton searchbox".split(" "),
);
const IDREF_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-flowto", "aria-details", "aria-errormessage", "aria-activedescendant"];
const IMPLICIT_ROLE: Record<string, string> = {
  button: "button", nav: "navigation", ul: "list", ol: "list", li: "listitem", img: "img", main: "main",
  aside: "complementary", form: "form", table: "table", article: "article", hr: "separator", dialog: "dialog",
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
};
const NO_LABEL_INPUT = new Set(["hidden", "submit", "reset", "button", "image"]);

const isEl = (n: Node): n is Element => "tagName" in n;
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const has = (el: Element, name: string) => el.attrs.some((a) => a.name === name);
const nonEmpty = (v: string | undefined) => v !== undefined && v.trim() !== "";
const kids = (el: Element): Node[] =>
  el.tagName === "template" ? (el as Template).content.childNodes : el.childNodes;

function focusable(el: Element): boolean {
  const t = el.tagName;
  if (t === "button" || t === "select" || t === "textarea" || t === "summary") return true;
  if (t === "a") return has(el, "href");
  if (t === "input") return attr(el, "type")?.toLowerCase() !== "hidden";
  return false;
}

/** Whether an element may contain readable content: text, holes, slots, TypeScript-managed elements, named descendants. */
function hasContent(el: Element): boolean {
  for (const c of kids(el)) {
    if (c.nodeName === "#text") {
      if ((c as { value: string }).value.trim()) return true;
    } else if (isEl(c)) {
      if (c.tagName === "style" || c.tagName === "script") continue;
      if (c.tagName === "slot" || has(c, "data-ref")) return true;
      if (nonEmpty(attr(c, "aria-label")) || nonEmpty(attr(c, "title"))) return true;
      if (c.tagName === "img" && nonEmpty(attr(c, "alt"))) return true;
      if (hasContent(c)) return true;
    }
  }
  return false;
}

const named = (el: Element) =>
  nonEmpty(attr(el, "aria-label")) || nonEmpty(attr(el, "aria-labelledby")) || nonEmpty(attr(el, "title"));

/** Check a template for ARIA and basic accessibility problems. Returns warnings and never throws. */
export function checkA11y(html: string, ignore: readonly string[] = []): A11yDiagnostic[] {
  const root = parseFragment(html, { sourceCodeLocationInfo: true });
  const out: A11yDiagnostic[] = [];
  const skip = new Set(ignore);

  // Collect ids and label[for] first
  const ids = new Map<string, number>();
  const labelFor: { id: string; el: Element }[] = [];
  const all: { el: Element; parent: Element | null; inList: boolean; inLabel: boolean }[] = [];
  (function collect(parent: { childNodes: Node[] }, domParent: Element | null, inList: boolean, inLabel: boolean) {
    for (const n of parent.childNodes) {
      if (!isEl(n)) continue;
      const list = inList || (n.tagName === "template" && has(n, "data-each"));
      const label = inLabel || n.tagName === "label";
      all.push({ el: n, parent: domParent, inList, inLabel });
      const id = attr(n, "id");
      if (nonEmpty(id)) ids.set(id as string, (ids.get(id as string) ?? 0) + 1);
      if (n.tagName === "label" && nonEmpty(attr(n, "for"))) labelFor.push({ id: attr(n, "for") as string, el: n });
      if (n.tagName === "template") collect((n as Template).content, domParent, list, label);
      else collect(n, n, list, label);
    }
  })(root, null, false, false);

  const report = (rule: A11yRule, el: Element, detail?: string) => {
    if (skip.has(rule)) return;
    const loc = el.sourceCodeLocation;
    out.push({
      rule,
      severity: "warning",
      message: detail ?? A11Y_RULES[rule],
      line: loc?.startLine ?? 1,
      col: loc?.startCol ?? 1,
    });
  };

  let lastHeading = 0;
  const landmarks = all.filter((x) => (x.el.tagName === "nav" || x.el.tagName === "aside") && attr(x.el, "role") !== "presentation");
  const descendants = (el: Element): Element[] =>
    kids(el).flatMap((c) => (isEl(c) ? [c, ...descendants(c)] : []));
  for (const { el, parent, inList, inLabel } of all) {
    const tag = el.tagName;
    const managed = has(el, "data-ref"); // managed by TypeScript: the name may be set there, so skip the "missing name" checks
    const role = attr(el, "role")?.trim().split(/\s+/)[0];

    if (tag === "img" && !has(el, "alt") && !managed && role !== "presentation" && role !== "none") report("img-alt", el);

    if ((tag === "button" || tag === "summary" || (tag === "a" && has(el, "href"))) && !managed && !named(el) && !hasContent(el)) {
      report("control-name", el, `<${tag}> has no accessible name. Fix: add text, a {{ hole }}, a <slot>, aria-label or aria-labelledby.`);
    }

    if (
      (tag === "select" || tag === "textarea" || (tag === "input" && !NO_LABEL_INPUT.has((attr(el, "type") ?? "text").toLowerCase()))) &&
      !managed && !named(el) && !inLabel
    ) {
      const id = attr(el, "id");
      if (!(nonEmpty(id) && labelFor.some((l) => l.id === id))) {
        report("form-label", el, `<${tag}> has no label. Fix: wrap it in a <label>, add <label for="id"> with a matching id, or add aria-label.`);
      }
    }

    if (tag === "iframe" && !managed && !named(el)) report("iframe-title", el);
    if (tag === "dialog" && !managed && !nonEmpty(attr(el, "aria-label")) && !nonEmpty(attr(el, "aria-labelledby"))) report("dialog-name", el);
    if (/^h[1-6]$/.test(tag) && !managed && !nonEmpty(attr(el, "aria-label")) && !hasContent(el)) report("heading-empty", el, `<${tag}> is empty. Fix: add text or a {{ hole }}, or remove the heading element.`);

    if (role !== undefined && !ROLES.has(role) && !role.startsWith("doc-") && !role.startsWith("graphics-")) {
      report("aria-role", el, `role="${role}" is not a valid ARIA role. Fix: check the spelling against the WAI-ARIA roles.`);
    }
    for (const a of el.attrs) {
      if (a.name.startsWith("aria-") && !ARIA_ATTRS.has(a.name)) report("aria-attr", el, `${a.name} is not a valid ARIA attribute. Fix: check the spelling against the WAI-ARIA attributes.`);
    }

    const tabindex = attr(el, "tabindex");
    if (role && INTERACTIVE_ROLES.has(role) && !focusable(el) && tabindex === undefined && !managed) {
      report("role-tabindex", el, `<${tag} role="${role}"> is not natively focusable. Fix: add tabindex="0" and handle keyboard events, or use a native element such as <button>.`);
    }
    if (tabindex !== undefined && Number(tabindex) > 0) report("tabindex-positive", el, `tabindex="${tabindex}" disturbs the natural focus order. Fix: use tabindex="0" or "-1".`);
    if (attr(el, "aria-hidden") === "true" && (focusable(el) || (tabindex !== undefined && Number(tabindex) >= 0))) report("hidden-focusable", el);

    if (has(el, "data-on-click") && !focusable(el) && tag !== "label" && !(role && INTERACTIVE_ROLES.has(role) && tabindex !== undefined)) {
      report("click-semantics", el, `data-on-click is on <${tag}>, which is not natively operable, so keyboard and assistive technology users cannot use it. Fix: use <button> or <a href>, or add an interactive role plus tabindex and keyboard handling.`);
    }

    // Semantic checks
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      if (lastHeading && level > lastHeading + 1) report("heading-order", el, `<${tag}> skips a heading level (the previous heading is h${lastHeading}). Fix: use h${lastHeading + 1} here, or restructure the headings.`);
      lastHeading = level;
    }
    if (tag === "table" && !managed && role !== "presentation" && role !== "none" && !descendants(el).some((d) => d.tagName === "th")) {
      report("table-header", el);
    }
    if (tag === "ul" || tag === "ol" || tag === "menu") {
      for (const c of kids(el)) {
        if (!isEl(c) || c.tagName === "slot" || c.tagName === "script") continue;
        if (c.tagName === "template") {
          if (!has(c, "data-each")) continue;
          for (const item of (c as Template).content.childNodes) {
            if (isEl(item)) listItemProblem(item, tag, "The root element of a data-each item");
          }
        } else listItemProblem(c, tag, `A child of <${tag}>`);
      }
    }
    function listItemProblem(item: Element, listTag: string, what: string): void {
      if (item.tagName === "li") return;
      if (item.tagName.includes("-")) {
        if (attr(item, "role") !== "listitem") report("list-structure", item, `${what} inside <${listTag}> is the component <${item.tagName}>, which has no list item role. Fix: add role="listitem" to <${item.tagName}>, or make its root an <li>.`);
        return;
      }
      report("list-structure", item, `${what} inside <${listTag}> must be <li> or a custom element with role="listitem", found <${item.tagName}>. Fix: use <li> as the item root.`);
    }
    if (tag === "li" && parent && !["ul", "ol", "menu", "slot"].includes(parent.tagName) && !["list", "menu"].includes(attr(parent, "role") ?? "")) {
      report("list-structure", el, `<li> must be inside <ul>, <ol> or <menu>, found inside <${parent.tagName}>. Fix: change the parent element, or use a different element instead of <li>.`);
    }
    if ((tag === "nav" || tag === "aside") && landmarks.length > 1 && landmarks.filter((l) => l.el.tagName === tag).length > 1 && !named(el) && !managed) {
      report("landmark-label", el, `There are several <${tag}> landmarks in this template. Fix: give each one a distinct aria-label.`);
    }
    if (role && (IMPLICIT_ROLE[tag] === role || (tag === "a" && has(el, "href") && role === "link"))) {
      report("redundant-role", el, `<${tag}> already has the role "${role}". Fix: remove the redundant role attribute.`);
    }
    if (!managed) {
      for (const name of IDREF_ATTRS) {
        const v = attr(el, name);
        if (!nonEmpty(v)) continue;
        for (const ref of (v as string).trim().split(/\s+/)) {
          if (!ids.has(ref)) report("aria-idref", el, `${name}="${ref}" refers to an id that does not exist in this template. Fix: add the id here, or add "aria-idref" to the ignore list if it points to an element outside the component.`);
        }
      }
    }

    const id = attr(el, "id");
    if (nonEmpty(id)) {
      if (inList) report("id-in-list", el, `id="${id}" is inside a data-each template and would repeat for every item. Fix: use data-ref or a class instead.`);
      if ((ids.get(id as string) ?? 0) > 1) report("duplicate-id", el, `id="${id}" is used more than once in this template. Fix: make every id unique.`);
    }
  }
  for (const { id, el } of labelFor) {
    if (!ids.has(id)) report("label-for", el, `<label for="${id}"> points to an id that does not exist in this template. Fix: add id="${id}" to the control, or wrap the control in the label.`);
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}
