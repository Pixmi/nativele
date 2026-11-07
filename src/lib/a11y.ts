import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { Diagnostic } from "./codegen.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Template = DefaultTreeAdapterMap["template"];
type Fragment = DefaultTreeAdapterMap["documentFragment"];

/** A component the template can use, by tag: its template file and text when they could be read (see `contractsFor`). */
export type A11yChildren = ReadonlyMap<string, { template?: { file: string; html: string } }>;

/** Every check, by rule id (usable in `ignore`), with a short description. */
export const A11Y_RULES = {
  "img-alt": "<img> has no alt attribute, so screen readers cannot describe it",
  "control-name": "a button, <summary> or link has no accessible name",
  "form-label": "a form control has no label",
  "iframe-title": "<iframe> has no title",
  "dialog-name": "<dialog> has no accessible name",
  "heading-empty": "a heading is empty",
  "aria-role": "a role is not a valid ARIA role",
  "aria-attr": "an aria-* attribute is not a valid ARIA attribute",
  "role-tabindex": "an element with an interactive role is not focusable",
  "tabindex-positive": "a positive tabindex disturbs the natural focus order",
  "hidden-focusable": "a focusable element has aria-hidden=\"true\"",
  "label-for": "<label for> points to an id that does not exist in the template",
  "id-in-list": "an id inside a data-each template repeats for every item",
  "duplicate-id": "an id is used more than once in the template",
  "aria-idref": "an ARIA attribute refers to an id that does not exist in the template",
  "heading-order": "heading levels are skipped",
  "table-header": "<table> has no <th> header cells",
  "list-structure": "a list holds something other than list items, or a list item is outside a list",
  "landmark-label": "several landmarks of the same kind are not told apart by aria-label",
  "redundant-role": "the role repeats the element's native role",
  "click-semantics": "data-on-click is on an element that keyboard and assistive technology users cannot operate",
  "unchecked-content": "click-semantics, control-name or heading-empty cannot judge an element, because what decides it is content lint cannot read",
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

/** The rules that judge composed content: what an element fails with, and the fix that needs no content lint cannot read. */
const COMPOSED_RULES = {
  "click-semantics": ["has no operable element a click could come from", "put data-on-click on a <button> or <a href>, or add an interactive role plus tabindex and keyboard handling"],
  "control-name": ["has no accessible name", "add text or aria-label"],
  "heading-empty": ["is empty", "add text or aria-label"],
} as const;
type ComposedRule = keyof typeof COMPOSED_RULES;
const and = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));

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

const roleOf = (el: Element) => attr(el, "role")?.trim().split(/\s+/)[0];

/** Whether a user can operate the element with the keyboard: natively, through an interactive role plus tabindex, or as editable content. */
function operable(el: Element): boolean {
  const role = roleOf(el);
  const editable = attr(el, "contenteditable");
  return focusable(el) || (!!role && INTERACTIVE_ROLES.has(role) && has(el, "tabindex")) || (editable !== undefined && editable.toLowerCase() !== "false");
}

const descendants = (nodes: Node[]): Element[] => nodes.flatMap((c) => (isEl(c) ? [c, ...descendants(kids(c))] : []));
const isCustom = (el: Element) => el.tagName.includes("-") && el.namespaceURI === "http://www.w3.org/1999/xhtml";

/**
 * A node of an element's composed content: what the page shows inside it once every component in it has rendered its template.
 * `slots` is what the element using the component that the node's template belongs to puts in each named slot; none in the template being checked, whose slots are filled by whoever uses it.
 * `path` holds the components being rendered, so a component that contains itself is rendered once.
 */
interface Composed {
  node: Node;
  slots?: Map<string, Composed[]>;
  path: ReadonlySet<string>;
}

/** The parsed templates of one checkA11y call, by template. */
type Parsed = Map<{ html: string }, Node[]>;
const templateNodes = (template: { html: string }, parsed: Parsed): Node[] => {
  let nodes = parsed.get(template);
  if (!nodes) parsed.set(template, (nodes = parseFragment(template.html).childNodes));
  return nodes;
};

/** The elements of composed content that lint cannot read, each with how a message names it. */
type Unread = Map<Element, string>;

/**
 * The children of a composed node. Content lint cannot read is added to `unread`: a custom element without a readable template, which has no children here,
 * and a slot of the template being checked, which its user fills, so only its fallback content is read.
 */
function composedKids(c: Composed, children: A11yChildren, parsed: Parsed, unread: Unread): Composed[] {
  const n = c.node;
  if (!isEl(n)) return [];
  const here = (nodes: Node[]) => nodes.map((node) => ({ ...c, node }));
  if (n.tagName === "slot") {
    const name = attr(n, "name");
    if (!c.slots) {
      unread.set(n, `<slot${name === undefined ? "" : ` name="${name}"`}> (the user of this component fills it)`);
      return here(kids(n));
    }
    const given = c.slots.get(name ?? "");
    return given?.length ? given : here(kids(n));
  }
  if (!isCustom(n)) return here(kids(n));
  const template = children.get(n.tagName)?.template;
  if (!template) {
    unread.set(n, `<${n.tagName}>${c.path.size ? ` in the template of <${[...c.path].at(-1)}>` : ""} (a custom element whose template lint cannot read)`);
    return [];
  }
  if (c.path.has(n.tagName)) return [];
  const slots = new Map<string, Composed[]>();
  for (const k of here(kids(n))) {
    const name = isEl(k.node) ? (attr(k.node, "slot") ?? "") : "";
    slots.set(name, [...(slots.get(name) ?? []), k]);
  }
  const path = new Set([...c.path, n.tagName]);
  return templateNodes(template, parsed).map((node) => ({ node, slots, path }));
}

/** Whether what an element puts in the slot `name` of the component `tag` is inside a <label> once the component renders it. */
function slotInLabel(tag: string, name: string, children: A11yChildren, parsed: Parsed, path: ReadonlySet<string> = new Set()): boolean {
  const template = children.get(tag)?.template;
  if (!template || path.has(tag)) return false;
  const inner = new Set([...path, tag]);
  const walk = (nodes: Node[], inLabel: boolean): boolean =>
    nodes.some((n) => {
      if (!isEl(n)) return false;
      if (n.tagName === "slot") return inLabel && (attr(n, "name") ?? "") === name;
      const here = inLabel || n.tagName === "label";
      if (!isCustom(n)) return walk(kids(n), here);
      return kids(n).some((k) => walk([k], here || (isEl(k) && slotInLabel(n.tagName, attr(k, "slot") ?? "", children, parsed, inner))));
    });
  return walk(templateNodes(template, parsed), false);
}

/** Whether some element of the composed content of `c` that lint can read passes `test`. */
function someInside(c: Composed, test: (el: Element) => boolean, children: A11yChildren, parsed: Parsed, unread: Unread): boolean {
  return composedKids(c, children, parsed, unread).some((k) => (isEl(k.node) && test(k.node)) || someInside(k, test, children, parsed, unread));
}

/** Whether the composed content of `c` that lint can read holds readable content: text, holes, TypeScript-managed elements or named descendants. */
function hasContent(c: Composed, children: A11yChildren, parsed: Parsed, unread: Unread): boolean {
  for (const k of composedKids(c, children, parsed, unread)) {
    const n = k.node;
    if (n.nodeName === "#text") {
      if ((n as { value: string }).value.trim()) return true;
    } else if (isEl(n)) {
      if (n.tagName === "style" || n.tagName === "script") continue;
      if (has(n, "data-ref") || nonEmpty(attr(n, "aria-label")) || nonEmpty(attr(n, "title"))) return true;
      if (n.tagName === "img" && nonEmpty(attr(n, "alt"))) return true;
      if (hasContent(k, children, parsed, unread)) return true;
    }
  }
  return false;
}

const named = (el: Element) =>
  nonEmpty(attr(el, "aria-label")) || nonEmpty(attr(el, "aria-labelledby")) || nonEmpty(attr(el, "title"));

/**
 * Check a template for ARIA and basic accessibility problems. Returns warnings and never throws.
 * `children` are the components whose templates can be read (see `contractsFor` and `contractsAt`): the content of a button, link, heading or data-on-click element
 * includes what such a component renders inside it; when the rest of the content decides nothing because it holds another custom element or a slot of this template, unchecked-content is reported instead.
 * `root` is the template already parsed with source locations (`analyze(html).root`), so a run that has it does not parse again.
 */
export function checkA11y(html: string, ignore: readonly string[] = [], children: A11yChildren = new Map(), root: Fragment = parseFragment(html, { sourceCodeLocationInfo: true })): Diagnostic[] {
  const out: Diagnostic[] = [];
  const skip = new Set(ignore);

  const parsed: Parsed = new Map();
  const slotsInLabel = new Map<string, boolean>();
  const slotInLabelOf = (tag: string, slot: string) => {
    const key = `${tag}\0${slot}`;
    let found = slotsInLabel.get(key);
    if (found === undefined) slotsInLabel.set(key, (found = slotInLabel(tag, slot, children, parsed)));
    return found;
  };
  const ids = new Map<string, number>();
  const labelFor: { id: string; el: Element }[] = [];
  const all: { el: Element; parent: Element | null; inList: boolean; inLabel: boolean }[] = [];
  (function collect(parent: { childNodes: Node[] }, domParent: Element | null, inList: boolean, around: boolean) {
    const component = "tagName" in parent && isCustom(parent as Element) ? (parent as Element).tagName : undefined;
    for (const n of parent.childNodes) {
      if (!isEl(n)) continue;
      const inLabel = around || (component !== undefined && slotInLabelOf(component, attr(n, "slot") ?? ""));
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

  const report = (rule: A11yRule, el: Element, message: string) => {
    if (skip.has(rule)) return;
    const loc = el.sourceCodeLocation;
    out.push({
      rule,
      severity: "warning",
      message,
      line: loc?.startLine ?? 1,
      col: loc?.startCol ?? 1,
    });
  };

  const top = (el: Element): Composed => ({ node: el, path: new Set() });
  const content = (el: Element, unread: Unread) => hasContent(top(el), children, parsed, unread);
  // A click on an operable element inside, by keyboard too, reaches the handler of the element around it.
  const clickable = (el: Element, unread: Unread) => operable(el) || someInside(top(el), operable, children, parsed, unread);

  let lastHeading = 0;
  const landmarks = all.filter((x) => (x.el.tagName === "nav" || x.el.tagName === "aside") && attr(x.el, "role") !== "presentation");
  for (const { el, parent, inList, inLabel } of all) {
    const tag = el.tagName;
    const managed = has(el, "data-ref"); // managed by TypeScript: the name may be set there, so skip the "missing name" checks
    const role = roleOf(el);
    const notJudged: ComposedRule[] = [];
    const unreadHere: Unread = new Map();
    /** Whether `rule` fails on the content lint can read; when content it cannot read could change that, the rule is noted as not judged instead. */
    const fails = (rule: ComposedRule, failsOn: (unread: Unread) => boolean): boolean => {
      if (skip.has(rule)) return false;
      const unread: Unread = new Map();
      if (!failsOn(unread)) return false;
      // A custom element with no definition at all is reported by unchecked-custom-elements.
      if (unread.has(el) && !children.has(tag)) return false;
      if (!unread.size) return true;
      notJudged.push(rule);
      for (const [n, name] of unread) unreadHere.set(n, name);
      return false;
    };

    if (tag === "img" && !has(el, "alt") && !managed && role !== "presentation" && role !== "none") report("img-alt", el, `<img> has no alt attribute, so screen readers cannot describe it. Fix: add alt="description", or alt="" if the image is purely decorative.`);

    if ((tag === "button" || tag === "summary" || (tag === "a" && has(el, "href"))) && !managed && !named(el) && fails("control-name", (u) => !content(el, u))) {
      report("control-name", el, `<${tag}> has no accessible name. Fix: add text, a {{ hole }}, aria-label or aria-labelledby.`);
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

    if (tag === "iframe" && !managed && !named(el)) report("iframe-title", el, "<iframe> has no title. Fix: add a title attribute (or aria-label) that describes its content.");
    if (tag === "dialog" && !managed && !nonEmpty(attr(el, "aria-label")) && !nonEmpty(attr(el, "aria-labelledby"))) report("dialog-name", el, "<dialog> has no accessible name. Fix: add aria-label or aria-labelledby.");
    if (/^h[1-6]$/.test(tag) && !managed && !nonEmpty(attr(el, "aria-label")) && fails("heading-empty", (u) => !content(el, u))) report("heading-empty", el, `<${tag}> is empty. Fix: add text or a {{ hole }}, or remove the heading element.`);

    if (role !== undefined && !ROLES.has(role) && !role.startsWith("doc-") && !role.startsWith("graphics-")) {
      report("aria-role", el, `role="${role}" is not a valid ARIA role. Fix: check the spelling against the WAI-ARIA roles.`);
    }
    for (const a of el.attrs) {
      if (a.name.startsWith("aria-") && !ARIA_ATTRS.has(a.name)) report("aria-attr", el, `${a.name} is not a valid ARIA attribute. Fix: check the spelling against the WAI-ARIA attributes.`);
    }

    const tabindex = attr(el, "tabindex");
    const interactiveRole = !!role && INTERACTIVE_ROLES.has(role);
    const unoperableClick = has(el, "data-on-click") && !interactiveRole && fails("click-semantics", (u) => !clickable(el, u));
    if (interactiveRole && !focusable(el) && tabindex === undefined && !managed) {
      report("role-tabindex", el, `<${tag} role="${role}"> is not natively focusable. Fix: add tabindex="0" and handle keyboard events, or use a native element such as <button>.`);
    }
    if (tabindex !== undefined && Number(tabindex) > 0) report("tabindex-positive", el, `tabindex="${tabindex}" disturbs the natural focus order. Fix: use tabindex="0" or "-1".`);
    if (attr(el, "aria-hidden") === "true" && (focusable(el) || (tabindex !== undefined && Number(tabindex) >= 0))) report("hidden-focusable", el, `A focusable element has aria-hidden="true", so keyboard users can reach something screen readers cannot see. Fix: remove aria-hidden, or make the element non-focusable.`);

    if (unoperableClick) {
      if (!tag.includes("-")) {
        report("click-semantics", el, `data-on-click is on <${tag}>, which is not natively operable, so keyboard and assistive technology users cannot use it. Fix: use <button> or <a href>, or add an interactive role plus tabindex and keyboard handling.`);
      } else {
        report("click-semantics", el, `data-on-click is on <${tag}>, and its template (${children.get(tag)?.template?.file}) has no operable element a click could come from, so keyboard and assistive technology users cannot use it. Fix: put a <button> or <a href> in that template, or add an interactive role plus tabindex to <${tag}> here and handle keyboard events.`);
      }
    }

    if (notJudged.length) {
      const custom = [...unreadHere.keys()].filter((n) => n.tagName !== "slot");
      const own = [...new Set(custom.filter((n) => !children.has(n.tagName)).map((n) => `<${n.tagName}>`))];
      const noFile = [...new Set(custom.filter((n) => children.has(n.tagName)).map((n) => `<${n.tagName}>`))];
      report(
        "unchecked-content",
        el,
        `<${tag}> was not checked for ${and(notJudged)}: its content holds ${and([...new Set(unreadHere.values())])}, and without what that renders, <${tag}> ${and(notJudged.map((r) => COMPOSED_RULES[r][0]))}. Fix: nothing needs to change if that content makes it right (pass --ignore=unchecked-content to silence this); otherwise ${notJudged.map((r) => `${notJudged.length > 1 ? `for ${r}, ` : ""}${COMPOSED_RULES[r][1]}`).join("; ")}${own.length ? `; for a component of this project, add the folder that defines ${and(own)} to the scanned folders` : ""}${noFile.length ? `; ${and(noFile)} ${noFile.length > 1 ? "are" : "is"} defined in the scanned folders, but the template file ${noFile.length > 1 ? "their classes import" : "its class imports"} cannot be read, so restore that file or correct the import path in the class` : ""}.`,
      );
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      if (lastHeading && level > lastHeading + 1) report("heading-order", el, `<${tag}> skips a heading level (the previous heading is h${lastHeading}). Fix: use h${lastHeading + 1} here, or restructure the headings.`);
      lastHeading = level;
    }
    if (tag === "table" && !managed && role !== "presentation" && role !== "none" && !descendants(kids(el)).some((d) => d.tagName === "th")) {
      report("table-header", el, `<table> has no <th> header cells. Fix: add <th> cells, or set role="presentation" if the table is only used for layout.`);
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
