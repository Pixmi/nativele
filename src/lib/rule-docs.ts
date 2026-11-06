export interface RuleDoc {
  /** Why the rule exists, in one or two sentences, tied to a principle of the library where there is one. */
  why: string;
  /** A short wrong example (HTML, TypeScript, or both), as it would appear in a project. */
  bad: string;
  /** The corrected version of the same example. */
  good: string;
}

export const RULE_DOCS: Record<string, RuleDoc> = {
  // CODEGEN_RULES
  "invalid-hole": {
    why: "HTML only names things: a hole is a single identifier that TypeScript fills in. Paths and expressions would turn the template into a language, and codegen could not derive a field name from them.",
    bad: `<!-- card.html -->
<h2>{{ user.name }}</h2>
<p>{{ count + 1 }}</p>`,
    good: `<!-- card.html -->
<h2>{{ userName }}</h2>
<p>{{ nextCount }}</p>
// card.ts: compute the value in TypeScript, then fill the named hole
this.set({ userName: user.name, nextCount: count + 1 });`,
  },
  "attr-hole": {
    why: "Holes are only text slots. An attribute value is not a text node, so it cannot be filled the same way and would be left as literal braces.",
    bad: `<!-- card.html -->
<a href="/user/{{ id }}">profile</a>`,
    good: `<!-- card.html -->
<a data-ref="link">profile</a>
// card.ts
this.refs.link.href = "/user/" + id;`,
  },
  "invalid-event-name": {
    why: "The part after data-on- becomes the name of a DOM event listener, so it must be a plain event name. Modifiers or other characters (as other frameworks allow) would make it listen for an event that never fires.",
    bad: `<form data-on-submit.prevent="save">...</form>`,
    good: `<!-- form.html -->
<form data-on-submit="save">...</form>
// form.ts
save(e: Event): void { e.preventDefault(); }`,
  },
  "invalid-handler": {
    why: "data-on-* only names a method; HTML holds no expressions or calls. A call such as save(1) would not be run, and the type of the method could not be checked.",
    bad: `<button data-on-click="removeItem(item.id)">x</button>`,
    good: `<button data-on-click="removeItem">x</button>
// card.ts: inside a list, hit.key is the item's key
removeItem(_e: Event, hit: EventHit) { this.set((s) => ({ rows: s.rows.filter((r) => r.id !== hit.key) })); }`,
  },
  "reserved-handler": {
    why: "A handler becomes a method on the component class. A name such as render, click or remove would override a member of HTMLElement or ts-dom and break the component in ways tsc cannot always see.",
    bad: `<button data-on-click="render">refresh</button>`,
    good: `<button data-on-click="refresh">refresh</button>`,
  },
  "empty-ref": {
    why: "data-ref names an element so TypeScript can reach it through this.refs. An empty name gives codegen nothing to generate.",
    bad: `<input data-ref="">`,
    good: `<input data-ref="name">
// card.ts
this.refs.name.focus();`,
  },
  "duplicate-ref": {
    why: "Each data-ref becomes one field of this.refs, so two elements with the same name would be indistinguishable and one would be unreachable.",
    bad: `<button data-ref="btn">ok</button>
<button data-ref="btn">cancel</button>`,
    good: `<button data-ref="ok">ok</button>
<button data-ref="cancel">cancel</button>`,
  },
  "empty-if": {
    why: "data-if names a condition that TypeScript toggles through this.set. Without a name there is nothing to toggle.",
    bad: `<p data-if="">Saved</p>`,
    good: `<p data-if="saved">Saved</p>
// card.ts
this.set({ saved: true });`,
  },
  "if-on-item-root": {
    why: "The root element of a data-each item is the item itself, created and removed by the list. A data-if on it would fight the list over whether the item exists.",
    bad: `<template data-each="rows">
  <li data-if="visible">{{ label }}</li>
</template>`,
    good: `<template data-each="rows">
  <li><span data-if="visible">{{ label }}</span></li>
</template>`,
  },
  "slot-in-list": {
    why: "A slot is filled once by the light DOM of the component, but a data-each template is cloned for every item, so the same slot would appear many times.",
    bad: `<template data-each="rows">
  <li><slot></slot></li>
</template>`,
    good: `<slot></slot>
<template data-each="rows">
  <li>{{ label }}</li>
</template>`,
  },
  "style-not-top-level": {
    why: "The component collects its styles from the top level of the template and applies them once. A style nested inside other markup would not be picked up.",
    bad: `<div>
  <style>p { color: red; }</style>
  <p>hi</p>
</div>`,
    good: `<style>p { color: red; }</style>
<div>
  <p>hi</p>
</div>`,
  },
  "duplicate-slot": {
    why: "Two slots with the same name receive the same light DOM, and the browser shows it in only one of them. This is a warning because it is sometimes a mistake of copying markup.",
    bad: `<slot name="actions"></slot>
<slot name="actions"></slot>`,
    good: `<slot name="actions"></slot>
<slot name="footer"></slot>`,
  },
  "each-not-template": {
    why: "A list needs an inert prototype that is cloned for each item. Only a <template> provides that without being rendered itself.",
    bad: `<ul data-each="todos">
  <li>{{ title }}</li>
</ul>`,
    good: `<ul>
  <template data-each="todos">
    <li>{{ title }}</li>
  </template>
</ul>`,
  },
  "empty-each": {
    why: "The data-each name becomes this.lists.<name>. An empty name gives codegen no list to generate.",
    bad: `<template data-each="">
  <li>{{ title }}</li>
</template>`,
    good: `<template data-each="todos">
  <li>{{ title }}</li>
</template>`,
  },
  "nested-each": {
    why: "Updates are explicit and local; nested lists would need a tree of lists to keep in step. Give the inner list to a child component instead.",
    bad: `<template data-each="groups">
  <li>
    <template data-each="items"><span>{{ label }}</span></template>
  </li>
</template>`,
    good: `<template data-each="groups" data-key="id" data-prop="group">
  <group-row></group-row>
</template>
<!-- group-row.html has its own data-each="items" -->`,
  },
  "each-in-svg": {
    why: "Inside <svg> or <math> the parser makes <template> an ordinary element of that namespace, without the inert content a list is built from.",
    bad: `<svg viewBox="0 0 100 10">
  <template data-each="dots"><circle r="2"></circle></template>
</svg>`,
    good: `<svg viewBox="0 0 100 10" data-ref="chart"></svg>
<!-- create the <circle> elements in render with document.createElementNS -->`,
  },
  "duplicate-each": {
    why: "Each data-each name becomes one entry of this.lists, so two lists with one name would be the same list in TypeScript.",
    bad: `<template data-each="rows"><li>{{ a }}</li></template>
<template data-each="rows"><li>{{ b }}</li></template>`,
    good: `<template data-each="rows"><li>{{ a }}</li></template>
<template data-each="extras"><li>{{ b }}</li></template>`,
  },
  "each-binding-incomplete": {
    why: "A list of components needs both the field that identifies an item (data-key) and the prop that receives it (data-prop). With only one, codegen cannot type the items assignment.",
    bad: `<template data-each="tasks" data-key="id">
  <task-row></task-row>
</template>`,
    good: `<template data-each="tasks" data-key="id" data-prop="task">
  <task-row></task-row>
</template>`,
  },
  "invalid-each-binding": {
    why: "data-key and data-prop are names, not paths: the key is a field of the item and the prop is a property of the item component. Both must be single identifiers so tsc can check them.",
    bad: `<template data-each="tasks" data-key="meta.id" data-prop="the-task">
  <task-row></task-row>
</template>`,
    good: `<template data-each="tasks" data-key="id" data-prop="task">
  <task-row></task-row>
</template>`,
  },
  "each-binding-root": {
    why: "With data-key and data-prop the item is a component that receives the data through its prop, so the item root must be exactly one custom element.",
    bad: `<template data-each="tasks" data-key="id" data-prop="task">
  <li>{{ title }}</li>
</template>`,
    good: `<template data-each="tasks" data-key="id" data-prop="task">
  <task-row></task-row>
</template>`,
  },
  "each-root-count": {
    why: "Each item is cloned as one element so the list can move and remove it as a unit. Zero or several roots would leave no single element to key.",
    bad: `<template data-each="rows">
  <dt>{{ term }}</dt>
  <dd>{{ detail }}</dd>
</template>`,
    good: `<template data-each="rows">
  <div><dt>{{ term }}</dt><dd>{{ detail }}</dd></div>
</template>`,
  },
  "document-tag": {
    why: "A template is parsed as a fragment, and the browser drops <html>, <head> and <body> from fragments, so the markup would silently vanish.",
    bad: `<body>
  <h1>{{ title }}</h1>
</body>`,
    good: `<h1>{{ title }}</h1>`,
  },
  "forbidden-tag": {
    why: "A script in a template would run code from markup. Behavior belongs to TypeScript, and pages with Trusted Types enabled would block it.",
    bad: `<script>alert(1)</script>`,
    good: `// card.ts
connected() { /* put the behavior in the class */ }`,
  },
  "forbidden-attribute": {
    why: "on* attributes and srcdoc run code from markup or are blocked by Trusted Types. Events are attached by data-on-* to a named method instead.",
    bad: `<button onclick="save()">save</button>`,
    good: `<button data-on-click="save">save</button>`,
  },
  "unsafe-url": {
    why: "A javascript: URL in href, src, action or formaction runs code when followed, and Trusted Types pages block it. Use a handler for behavior.",
    bad: `<a href="javascript:void(0)">more</a>`,
    good: `<button data-on-click="more">more</button>`,
  },
  "duplicate-define": {
    why: "A custom element tag can be registered only once. define() skips a tag that is already registered, so with two classes for one tag the class whose define() runs first wins and the other is dropped without an error, and the tag map cannot say which class the tag stands for. ts-dom check also reports it when tsc finds two tag maps in one program that declare the tag with different classes (TS2717 in ts-dom-tags.ts), for example a folder scanned separately or a package that ships its own tag map.",
    bad: `// a.ts
define("user-card", CardA);
// b.ts
define("user-card", CardB);`,
    good: `// a.ts
define("user-card", CardA);
// b.ts
define("user-badge", CardB);`,
  },

  // UNUSED_MARKUP_RULES
  "unused-ref": {
    why: "A data-ref that no code reads is dead markup, and it often means the code that was meant to use the element was removed or misspelled.",
    bad: `<!-- card.html -->
<input data-ref="name">
// card.ts does not use this.refs.name`,
    good: `<input data-ref="name">
// card.ts
this.refs.name.focus();`,
  },
  "unused-if": {
    why: "A data-if that is never toggled stays in its initial state forever, which usually means the condition was never wired up.",
    bad: `<p data-if="error">Failed</p>
// card.ts never sets "error"`,
    good: `<p data-if="error">Failed</p>
// card.ts
this.set({ error: true });`,
  },
  "unused-text": {
    why: "A hole that no code fills renders empty, so the page shows nothing where a value was expected.",
    bad: `<h2>{{ title }}</h2>
// card.ts never sets "title"`,
    good: `<h2>{{ title }}</h2>
// card.ts
this.set({ title: "Hello" });`,
  },
  "unused-list": {
    why: "A data-each that the class never assigns or fills always renders an empty list.",
    bad: `<template data-each="rows"><li>{{ label }}</li></template>
// card.ts never uses this.lists.rows`,
    good: `<template data-each="rows"><li>{{ label }}</li></template>
// card.ts
this.lists.rows.replace(rows, (r) => r.id, (r, { text }) => (text.label = r.label));`,
  },
  "unused-item-name": {
    why: "A name inside a list item that no code fills or reads is dead markup, usually left over after the item shape changed.",
    bad: `<template data-each="rows"><li>{{ label }} {{ note }}</li></template>
// card.ts
this.lists.rows.replace(rows, (r) => r.id, (r, { text }) => (text.label = r.label));`,
    good: `<template data-each="rows"><li>{{ label }}</li></template>
// card.ts
this.lists.rows.replace(rows, (r) => r.id, (r, { text }) => (text.label = r.label));`,
  },
  "no-importer": {
    why: "A template that no TypeScript file imports never becomes a component, so it is dead code or an import that was forgotten.",
    bad: `// card.html exists, but no .ts file contains
// import tpl from "./card.html.js"`,
    good: `// card.ts
import tpl from "./card.html.js";`,
  },

  // DATA_FLOW_RULES
  "prop-forwarding": {
    why: "Props go down one level. Handing your own prop straight to a child is prop drilling and hides where the data really comes from; use a shared store or have the parent that owns the data set the child.",
    bad: `// panel.ts (props: { name: string })
render(view) { this.refs.kid.name = view.name; }`,
    good: `// panel.ts: fill the child from data this component owns
render(view) { this.refs.kid.name = this.state.label; }`,
  },
  "emit-forwarding": {
    why: "Events go up, one level at a time, and a parent that only re-emits a child's event builds an implicit chain across layers. Handle the event where it matters, or use a shared store.",
    bad: `// panel.ts
onChange(e) { this.emit("change", e.detail); }`,
    good: `// panel.ts
onChange(e) { this.set({ value: e.detail.value }); }`,
  },
  "props-mutation": {
    why: "Props are read-only inside the component: the parent owns them and sets them. Assigning one here would be overwritten at the next parent update and breaks one-way data flow.",
    bad: `// counter.ts (props: { count: number })
inc() { this.count = this.count + 1; }`,
    good: `// counter.ts
inc() { this.emit("count-change", { value: this.props.count + 1 }); }`,
  },
  "unguarded-input-value": {
    why: "render() runs on every change, including the change the user is typing. Assigning a form control's value, even to the same text, moves the caret to the end, so the write must be skipped when nothing differs.",
    bad: `// form.ts
override render(view: { name: string }) {
  this.refs.name.value = view.name;
}`,
    good: `// form.ts
override render(view: { name: string }) {
  if (this.refs.name.value !== view.name) this.refs.name.value = view.name;
}`,
  },
  "unchecked-custom-elements": {
    why: "Lint checks the attributes, events and data-on-click on a child tag against the child's define() and template. For a tag it has no single definition of (an element from another library, a component outside the scanned folders, or a tag defined in several packages and not exactly once in the template's package) those checks are skipped, and this one warning per run lists the tags so the gap is visible. ts-dom lint and ts-dom check report it; the oxlint plugin does not, as it would repeat it in every file. Silence it with --ignore=unchecked-custom-elements, for example in a --strict run that uses another library's elements.",
    bad: `# the app's own components live in src/ui, which is not scanned
npx ts-dom lint src/pages`,
    good: `npx ts-dom lint src/pages src/ui
# only elements from another library are left: nothing to change
npx ts-dom lint src --strict --ignore=unchecked-custom-elements`,
  },
  "custom-event-on-native": {
    why: "A child's custom event does not bubble, so a handler on a native element would never receive it. Events are handled on the tag of the component that emits them.",
    bad: `<div data-on-quantity-change="update">
  <qty-input></qty-input>
</div>`,
    good: `<div>
  <qty-input data-on-quantity-change="update"></qty-input>
</div>`,
  },
  "unknown-prop": {
    why: "An attribute on a child tag that the child does not declare in props is ignored at runtime, so a typo silently sets nothing.",
    bad: `<x-kid lable="hi"></x-kid>`,
    good: `<x-kid label="hi"></x-kid>
// x-kid.ts: Component(tpl, { props: { label: "" } })`,
  },
  "invalid-prop-value": {
    why: "An attribute is always a string, so it can only set string, number or boolean props. Other types can only be passed as JS properties.",
    bad: `<x-list items="a,b"></x-list>
// x-list.ts: props: { items: [] as string[] }`,
    good: `<x-list data-ref="list"></x-list>
// panel.ts
this.refs.list.items = ["a", "b"];`,
  },
  "unknown-event": {
    why: "The child does not declare this event in emits and it is not a native event, so the handler could never run. The check catches typos and removed events.",
    bad: `<qty-input data-on-quantity-chnage="update"></qty-input>`,
    good: `<qty-input data-on-quantity-change="update"></qty-input>
// qty-input.ts: emits: { "quantity-change": event<{ value: number }>() }`,
  },

  // A11Y_RULES
  "img-alt": {
    why: "Without alt, screen readers cannot describe the image, or read out its file name.",
    bad: `<img src="logo.png">`,
    good: `<img src="logo.png" alt="Nativele logo">
<img src="divider.png" alt="">`,
  },
  "control-name": {
    why: "A button or link with no text, hole, slot or aria-label has no accessible name, so assistive technology announces it as an unnamed control.",
    bad: `<button data-on-click="close"><svg></svg></button>`,
    good: `<button data-on-click="close" aria-label="Close"><svg></svg></button>`,
  },
  "form-label": {
    why: "A form control without a label cannot be identified by screen readers, and clicking the label text will not focus it.",
    bad: `<input data-ref="email">`,
    good: `<label>Email <input data-ref="email"></label>`,
  },
  "iframe-title": {
    why: "A screen reader announces an iframe by its title. Without one the user cannot tell what it contains.",
    bad: `<iframe src="/map"></iframe>`,
    good: `<iframe src="/map" title="Office location map"></iframe>`,
  },
  "dialog-name": {
    why: "A dialog without a name is announced with no context when it opens.",
    bad: `<dialog><p>Delete?</p></dialog>`,
    good: `<dialog aria-label="Confirm delete"><p>Delete?</p></dialog>`,
  },
  "heading-empty": {
    why: "An empty heading adds an empty stop to the heading navigation of assistive technology.",
    bad: `<h2></h2>`,
    good: `<h2>{{ title }}</h2>`,
  },
  "aria-role": {
    why: "An invalid role is ignored by browsers, so the element loses the meaning you meant to give it. This is almost always a misspelling.",
    bad: `<div role="buton">save</div>`,
    good: `<div role="button" tabindex="0">save</div>`,
  },
  "aria-attr": {
    why: "An unknown aria-* attribute is ignored by assistive technology, so the state you meant to expose is lost. This is almost always a misspelling.",
    bad: `<button aria-pressd="true">bold</button>`,
    good: `<button aria-pressed="true">bold</button>`,
  },
  "role-tabindex": {
    why: "An element with an interactive role promises keyboard use, but a non-focusable element cannot be reached with the keyboard.",
    bad: `<div role="button" data-on-click="save">save</div>`,
    good: `<button data-on-click="save">save</button>`,
  },
  "tabindex-positive": {
    why: "A positive tabindex pulls an element ahead of the natural order and makes the focus order differ from the reading order.",
    bad: `<button tabindex="3">save</button>`,
    good: `<button tabindex="0">save</button>`,
  },
  "hidden-focusable": {
    why: "A focusable element inside aria-hidden=\"true\" can be reached by keyboard but is invisible to screen readers.",
    bad: `<div aria-hidden="true"><button>save</button></div>`,
    good: `<div><button>save</button></div>`,
  },
  "label-for": {
    why: "A <label for> that points to a missing id labels nothing, so the control stays unnamed.",
    bad: `<label for="email">Email</label>
<input id="mail">`,
    good: `<label for="email">Email</label>
<input id="email">`,
  },
  "id-in-list": {
    why: "A data-each template is cloned for every item, so an id inside it is repeated and no longer unique in the document.",
    bad: `<template data-each="rows">
  <li id="row">{{ label }}</li>
</template>`,
    good: `<template data-each="rows">
  <li data-ref="row">{{ label }}</li>
</template>`,
  },
  "duplicate-id": {
    why: "Ids must be unique, or label, aria-labelledby and similar references point at the wrong element.",
    bad: `<input id="name">
<input id="name">`,
    good: `<input id="first-name">
<input id="last-name">`,
  },
  "aria-idref": {
    why: "An ARIA attribute such as aria-labelledby refers to an id that is not in this template, so the reference is dead. If the id lives outside the component, ignore the rule for that file.",
    bad: `<section aria-labelledby="heading">
  <h2 id="title">{{ title }}</h2>
</section>`,
    good: `<section aria-labelledby="title">
  <h2 id="title">{{ title }}</h2>
</section>`,
  },
  "heading-order": {
    why: "Skipping heading levels breaks the outline that screen reader users navigate by.",
    bad: `<h1>{{ title }}</h1>
<h3>{{ subtitle }}</h3>`,
    good: `<h1>{{ title }}</h1>
<h2>{{ subtitle }}</h2>`,
  },
  "table-header": {
    why: "Without header cells, a screen reader cannot tell which column or row a data cell belongs to.",
    bad: `<table><tr><td>Name</td><td>Age</td></tr></table>`,
    good: `<table><tr><th>Name</th><th>Age</th></tr></table>`,
  },
  "list-structure": {
    why: "Screen readers announce lists by counting their items, which only works when <ul>/<ol> contain <li> and <li> sits inside a list.",
    bad: `<ul><div>one</div></ul>`,
    good: `<ul><li>one</li></ul>`,
  },
  "landmark-label": {
    why: "When several landmarks of one kind exist, users navigating by landmark hear identical names and cannot tell them apart.",
    bad: `<nav>...</nav>
<nav>...</nav>`,
    good: `<nav aria-label="Main">...</nav>
<nav aria-label="Footer">...</nav>`,
  },
  "redundant-role": {
    why: "A role that repeats the native role adds nothing and can drift from the element if it is changed later.",
    bad: `<button role="button">save</button>`,
    good: `<button>save</button>`,
  },
  "click-semantics": {
    why: "A div or span with data-on-click cannot be focused or activated by keyboard, and assistive technology does not know it is clickable. A label that wraps a control is fine: a click on the control, by keyboard too, reaches the label's handler. An element with an interactive role and no tabindex is left to role-tabindex. On a component's tag, the click is operable when it can come from a <button>, <a href> or other operable element in the component's template, so lint reads that template; a custom element whose definition lint cannot read (from another library, outside the scanned folders, or defined in several packages) may handle the keyboard itself and is not checked.",
    bad: `<div data-on-click="open">open</div>
<!-- x-card.html: <div class="card"><span>{{ title }}</span></div> -->
<x-card data-on-click="open"></x-card>`,
    good: `<button data-on-click="open">open</button>
<!-- x-card.html: <div class="card"><button type="button">{{ title }}</button></div> -->
<x-card data-on-click="open"></x-card>
<wa-button data-on-click="open">open</wa-button>`,
  },

  // CHECK_RULES
  "stale-generated": {
    why: "Types come from the generated *.html.ts files. If one is missing, outdated or orphaned (its template was deleted, or a ts-dom-tags.ts was left in a subfolder that is no longer scanned and declares its tags a second time), tsc checks against old templates and its errors may not match the HTML. ts-dom doctor reports the same condition as a warning.",
    bad: `# card.html was edited, card.html.ts was not regenerated
npx ts-dom check --no-write`,
    good: `npx ts-dom gen
# or: npx ts-dom check (it regenerates first)`,
  },
  "missing-binding": {
    why: "Every {{ hole }} and data-if must be backed by a field in state, props or derive. tsc finds the ones that are not, which usually means a typo or a forgotten declaration.",
    bad: `<!-- card.html -->
<h2>{{ title }}</h2>
// card.ts
Component(tpl, { state: { name: "" } })`,
    good: `// card.ts
Component(tpl, { state: { title: "" } })`,
  },
  "conflicting-keys": {
    why: "state, props and derive share one namespace in the view. The same name in two of them would make it unclear who owns the value, against one-way data flow.",
    bad: `Component(tpl, {
  state: { total: 0 },
  derive: { total: (s) => s.count * 2 },
})`,
    good: `Component(tpl, {
  state: { count: 0 },
  derive: { total: (s) => s.count * 2 },
})`,
  },
  "reserved-prop": {
    why: "A prop becomes a property on the element, and names such as title, hidden or render already belong to HTMLElement or ts-dom.",
    bad: `Component(tpl, { props: { title: "" } })`,
    good: `Component(tpl, { props: { heading: "" } })`,
  },
  "native-event-name": {
    why: "An emitted event with a native name such as click or input would be confused with the native event and handled by the wrong listeners.",
    bad: `Component(tpl, { emits: { click: event() } })`,
    good: `Component(tpl, { emits: { "item-select": event() } })`,
  },
  "handler-event-type": {
    why: "Types are derived from the HTML: codegen records the tag and event each handler is bound to, and define() checks that the handler's first parameter accepts that event, so renaming the event or moving the handler to another tag cannot leave a wrong parameter type behind. A handler bound to several events must accept all of them; `Event` always does.",
    bad: `<!-- list.html -->
<item-picker data-on-item-picked="onPicked"></item-picker>
// list.ts
onPicked(e: MouseEvent) { /* ... */ }`,
    good: `<!-- list.html -->
<item-picker data-on-item-picked="onPicked"></item-picker>
// list.ts
onPicked(e: EmitEvent<ItemPicker, "item-picked">) { this.set({ picked: e.detail.id }); }`,
  },
  "missing-handler": {
    why: "data-on-* names a method, and a missing method means the event does nothing. define() checks it in tsc through the generated types, ts-dom check points the error at the data-on-* attribute, and the component throws when it connects without the method.",
    bad: `<button data-on-click="save">save</button>
// card.ts defines no save()`,
    good: `<button data-on-click="save">save</button>
// card.ts
save() { /* ... */ }`,
  },
  "item-prop-missing": {
    why: "A list with data-prop assigns each item to that property of the item component. If the component does not declare it, the items go nowhere.",
    bad: `<template data-each="tasks" data-key="id" data-prop="task"><task-row></task-row></template>
// task-row.ts
Component(tpl, { props: { item: {} as Task } })`,
    good: `// task-row.ts
Component(tpl, { props: { task: {} as Task } })`,
  },
  "item-not-in-tag-map": {
    why: "tsc learns which class a tag stands for from ts-dom-tags.ts. If the item component is missing there, its items cannot be typed.",
    bad: `// task-row.ts defines the tag, but ts-dom-tags.ts is out of date
define("task-row", TaskRow);`,
    good: `npx ts-dom gen   # regenerates ts-dom-tags.ts
// and keep ts-dom-tags.ts in the program: tsconfig.json
{ "include": ["src"] }   // not ["src/**/*.tsx"], and no exclude that matches it`,
  },
  "item-class-not-exported": {
    why: "The tag map imports the class from the file that calls define(), so the class must be exported or tsc cannot see its props.",
    bad: `class TaskRow extends Component(tpl, {}) {}
define("task-row", TaskRow);`,
    good: `export class TaskRow extends Component(tpl, {}) {}
define("task-row", TaskRow);`,
  },
  tsc: {
    why: "Any TypeScript error that none of the specific rules recognizes is passed through as tsc prints it, at its TypeScript location, so one command shows every problem.",
    bad: `// card.ts
const n: number = "1";`,
    good: `// card.ts
const n: number = 1;`,
  },
  "tsc-failed": {
    why: "When tsc stops before checking (no tsconfig, a bad option, a crash), a check that only looked for type errors would pass with none. This rule makes that visible.",
    bad: `npx ts-dom check --project=tsconfig.app.json   # the file does not exist`,
    good: `npx ts-dom check --project=tsconfig.json`,
  },
  "dir-not-found": {
    why: "A folder given to ts-dom check or doctor, or to tsDom({ dirs }) in the Vite plugin, that does not exist would otherwise be skipped silently, and a clean result would only mean that nothing was looked at. The Vite plugin resolves dirs against Vite's root, not the working directory.",
    bad: `npx ts-dom check ap   # the templates live in app/
// vite.config.ts with root: "web": tsDom({ dirs: ["web/src"] }) looks for web/web/src`,
    good: `npx ts-dom check app
// vite.config.ts with root: "web": tsDom({ dirs: ["src"] })`,
  },
  "tsc-not-found": {
    why: "ts-dom check runs the TypeScript compiler of the project. Without it installed, nothing can be type-checked, so this is an error: otherwise a CI job that omits the dev dependencies would pass without any type check.",
    bad: `npx ts-dom check   # typescript is not installed`,
    good: `npm i -D typescript
npx ts-dom check`,
  },

  // DOCTOR_RULES
  "no-tsconfig": {
    why: "The core value of the library is that tsc checks HTML against TypeScript, and tsc needs a tsconfig.json to know what to check.",
    bad: `# project root has no tsconfig.json`,
    good: `// tsconfig.json
{ "compilerOptions": { "strict": true, "lib": ["ES2022", "DOM"] }, "include": ["src"] }`,
  },
  "tsconfig-not-strict": {
    why: "The names in the templates are checked with or without strict, but without it tsc does not report values that may be null (a querySelector result, an optional ref) or parameters that are implicitly any (a handler parameter without a type). TypeScript 6 and later turn strict on when it is left out; TypeScript 5 leaves it off, so there it has to be set. When the project's TypeScript cannot be resolved, its version is unknown, and a missing strict is reported as on TypeScript 5.",
    bad: `// tsconfig.json
{ "compilerOptions": { "strict": false } }
// or, with TypeScript 5, no "strict" at all`,
    good: `// tsconfig.json
{ "compilerOptions": { "strict": true } }`,
  },
  "tsconfig-no-dom-lib": {
    why: "Components extend HTMLElement and refs are element types. Without the DOM lib those types do not exist.",
    bad: `// tsconfig.json
{ "compilerOptions": { "lib": ["ES2022"] } }`,
    good: `// tsconfig.json
{ "compilerOptions": { "lib": ["ES2022", "DOM"] } }`,
  },
  "tsconfig-classic-resolution": {
    why: "Every generated x.html.ts imports the runtime package (@nativele/ts-dom), and the classic resolution does not look in node_modules, so tsc reports TS2792 (Cannot find module) and no component gets its types. TypeScript 5 also resolves the classic way when moduleResolution is left out and module is ES2015 to ESNext (or target is ES2015 or later without module). TypeScript 6 deprecates classic (TS5107) and 7 removes it (TS5108); both stop before checking anything.",
    bad: `// tsconfig.json
{ "compilerOptions": { "moduleResolution": "classic" } }
// or, with TypeScript 5
{ "compilerOptions": { "module": "ESNext" } }`,
    good: `// tsconfig.json
{ "compilerOptions": { "moduleResolution": "bundler" } }`,
  },
  "tsconfig-misses-templates": {
    why: "tsc only checks files under include. A template folder left out means its generated types are never checked against the components.",
    bad: `// tsconfig.json
{ "include": ["src/server"] }   // templates are in src/ui`,
    good: `// tsconfig.json
{ "include": ["src"] }`,
  },
  "tsconfig-misses-tag-map": {
    why: "ts-dom-tags.ts registers the components in HTMLElementTagNameMap. Usually no file imports it, so it is in the program only when include matches it and exclude does not remove it; a file in the program that imports or re-exports it (a package entry with export type {} from \"./ts-dom-tags.js\") brings it in as well, and then nothing is reported. Left out, tags are typed as plain HTMLElement and lists of item components fail with item-not-in-tag-map. The x.html.ts files do not have this problem: their components import them. include, exclude and files are read through extends as tsc reads them: each from the nearest config that sets it.",
    bad: `// tsconfig.json
{ "include": ["src/**/*.tsx"] }
{ "include": ["src"], "exclude": ["**/ts-dom-tags.ts"] }`,
    good: `// tsconfig.json
{ "include": ["src"] }
{ "include": ["src/**/*.tsx", "src/ts-dom-tags.ts"] }`,
  },
  "runtime-not-installed": {
    why: "Generated files import the runtime package. If it cannot be resolved from the project, they fail to compile and to run.",
    bad: `// card.html.ts imports "@nativele/ts-dom", which is not installed`,
    good: `npm i @nativele/ts-dom`,
  },
  "template-import-without-js": {
    why: "Without a bundler plugin, ./x.html is not a module. ./x.html.js is what TypeScript maps to the generated x.html.ts, and it works with or without Vite.",
    bad: `import tpl from "./card.html";`,
    good: `import tpl from "./card.html.js";`,
  },
  "framework-template": {
    why: "Every .html in a scanned folder is read as a Nativele template. An Angular component's templateUrl file uses Angular syntax ({{ user.name }}, *ngIf, (click)), so gen reports errors whose hints ask to rewrite a file that belongs to another framework.",
    bad: `// src/app/app.ts
@Component({ selector: "app-root", templateUrl: "./app.html" })
# package.json
"build": "ts-dom gen src && ng build"`,
    good: `# keep the Nativele components in their own folder and scan only it
"build": "ts-dom gen src/nv && ng build"`,
  },
  "typecheck-before-gen": {
    why: "The generated *.html.ts files are not committed. A script that runs tsc (or vue-tsc, svelte-check, ng build) before ts-dom gen works on a machine that has generated them once, and fails on a clean checkout or in CI with TS2307 for every ./x.html.js import.",
    bad: `// package.json, with *.html.ts in .gitignore
"build": "tsc && vite build"`,
    good: `"build": "ts-dom gen src && tsc && vite build"
// or, with plain tsc, let check generate and type-check in one step:
"typecheck": "ts-dom check src"`,
  },
  "vite-plugin-missing": {
    why: "The Vite plugin regenerates the .html.ts files while the dev server runs. Without it, edits to a template are not reflected until gen is run by hand. A vitest.config file replaces vite.config for Vitest, so unless it has the plugin too or merges vite.config, the tests start without generated files and fail on a clean checkout.",
    bad: `// vite.config.ts
export default defineConfig({ plugins: [] });
// vitest.config.ts next to a vite.config.ts that has tsDom()
export default defineConfig({ test: { environment: "happy-dom" } });`,
    good: `// vite.config.ts
import { tsDom } from "@nativele/ts-dom/vite";
export default defineConfig({ plugins: [tsDom()] });
// vitest.config.ts
import viteConfig from "./vite.config";
export default mergeConfig(viteConfig, defineConfig({ test: { environment: "happy-dom" } }));`,
  },
  "oxlint-plugin-missing": {
    why: "The oxlint plugin runs the template rules (unused markup, data flow, accessibility) in the editor. Without it they only run from the CLI. In a package of a workspace, the nearest lint config up to the workspace root is read.",
    bad: `// .oxlintrc.json
{ "rules": {} }`,
    good: `// .oxlintrc.json
{
  "jsPlugins": [{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }],
  "rules": { "ts-dom/unused-markup": "warn" }
}`,
  },
  "formatter-whitespace": {
    why: "Text whitespace in a template is kept as written. A formatter that re-indents the HTML can then change the spaces rendered on the page. The same warning is given when the scripts or the Vite config ask for collapse but the generated files were written with preserve: a run without --whitespace keeps the mode a file was last written with, so one run without the flag leaves the project on preserve. In a package of a workspace, the formatter's config files, the prettier key, dependencies and scripts in package.json, and .prettierignore are looked up to the workspace root, nearest first.",
    bad: `# formatter is configured, templates keep their whitespace
npx ts-dom gen
# or: package.json has "gen": "ts-dom gen src --whitespace=collapse", but the files came from a plain run
npx ts-dom check src`,
    good: `npx ts-dom gen --whitespace=collapse
// or in vite.config.ts: tsDom({ whitespace: "collapse" })
# and after a plain run: npm run gen (the script with the flag) once`,
  },
  "skill-available": {
    why: "A Nativele Skill gives an agent the verified steps, limitations and checks for a tool the project already uses. This is a suggestion and never changes the exit code.",
    bad: `// package.json lists "react", and the project has no copy of the nativele-react Skill`,
    good: `npx ts-dom skills add nativele-react   # copies it into .claude/skills/ or .agents/skills/
npx ts-dom skills nativele-react       # or just read it`,
  },
  "skill-outdated": {
    why: "A copied Skill does not update with the package. After an upgrade the copy may describe an older version of Nativele or of the tool it covers.",
    bad: `// .claude/skills/nativele-core/SKILL.md was copied from an older @nativele/ts-dom`,
    good: `npx ts-dom skills add nativele-core   # replaces the copy with the one shipped with the installed version`,
  },
};
