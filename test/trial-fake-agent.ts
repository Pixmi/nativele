// A stand-in agent for testing scripts/trial.ts without a model: it writes a fixed solution of the nativele-vue trial task into
// the current folder. Test infrastructure only, not an example of the Skill.
// TRIAL_AGENT_CMD="node <repo>/test/trial-fake-agent.ts good|broken" npm run trial -- run nativele-vue
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const mode = process.argv[2];
if (mode !== "good" && mode !== "broken") throw new Error("usage: trial-fake-agent.ts good|broken");
const broken = mode === "broken";

const files: Record<string, string> = {
  "src/nv/inventory-item.html": `<span data-ref="name"></span>
<em data-ref="low" hidden>low stock</em>
<slot name="badge"></slot>
<button type="button" data-on-click="pick">Select</button>
`,
  "src/nv/inventory-item.ts": `import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./inventory-item.html.js";

export interface Item {
  id: number;
  name: string;
  qty: number;
}

export class InventoryItem extends Component(tpl, {
  shadow: true,
  props: { item: null as Item | null, lowThreshold: 0 },
  emits: { "item-select": event<{ id: number }>() },
}) {
  pick(): void {
    const item = this.props.item;
    if (item) this.emit("item-select", { id: item.id });
  }
  override render(view: { item: Item | null; lowThreshold: number }): void {
    this.refs.name.textContent = view.item ? view.item.name : "";
    this.refs.low.hidden = !view.item || view.item.qty >= view.lowThreshold;
  }
}
define("nv-inventory-item", InventoryItem);
`,
  "src/nv/qty-input.html": `<input type="number" aria-label="Quantity" data-ref="input" data-on-input="onInput" />
`,
  "src/nv/qty-input.ts": `import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./qty-input.html.js";

export class QtyInput extends Component(tpl, {
  props: { value: 0 },
  emits: { "value-change": event<{ value: number }>() },
}) {
  onInput(): void {
    const value = this.refs.input.valueAsNumber;
    if (!Number.isNaN(value)) this.emit("value-change", { value });
  }
  override render(view: { value: number }): void {
    const next = String(view.value);
    if (this.refs.input.value !== next) this.refs.input.value = next;
  }
}
define("nv-qty-input", QtyInput);
`,
  "src/nv/inventory-store.ts": `import { createStore } from "@nativele/ts-dom";

export const totalStore = createStore(0);
`,
  "src/nv/inventory-summary.html": `<p>Total: {{ total }}</p>
`,
  "src/nv/inventory-summary.ts": `import { Component, define } from "@nativele/ts-dom";
import tpl from "./inventory-summary.html.js";
import { totalStore } from "./inventory-store.js";

export class InventorySummary extends Component(tpl) {
  override connected(): void {
    this.bind(totalStore, (total) => (this.text.total = String(total)));
  }
}
define("nv-inventory-summary", InventorySummary);
`,
  "src/main.ts": `import "./nv/inventory-item.js";
import "./nv/qty-input.js";
import "./nv/inventory-summary.js";
import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";

createApp(App).mount("#app");
`,
  "src/SummaryPanel.vue": `<template>
  <nv-inventory-summary />
</template>
`,
  "src/InventoryFooter.vue": `<template>
  <footer>Inventory footer</footer>
</template>
`,
  "src/App.vue": `<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import InventoryFooter from "./InventoryFooter.vue";
import SummaryPanel from "./SummaryPanel.vue";
import type { Item } from "./nv/inventory-item.js";
import { totalStore } from "./nv/inventory-store.js";

const items = ref<Item[]>([
  { id: 1, name: "apple", qty: 3 },
  { id: 2, name: "pear", qty: 0 },
  { id: 3, name: "plum", qty: 7 },
]);
const selectedId = ref<number | null>(null);
const selections = ref(0);
const showSummary = ref(true);
const selected = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null);

function select(id: number): void {
  selectedId.value = id;
  selections.value++;
}
function setQty(qty: number): void {
  items.value = items.value.map((i) => (i.id === selectedId.value ? { ...i, qty } : i));
}
function reverse(): void {
  items.value = [...items.value].reverse();
}
watchEffect(() => totalStore.set(items.value.reduce((sum, i) => sum + i.qty, 0)));
</script>

<template>
  <button type="button" @click="reverse">Reverse order</button>
  <nv-inventory-item v-for="it in items" :key="it.id" :item="it" ${broken ? ":low-threshold" : ":lowThreshold"}="2" @item-select="(e) => select(e.detail.id)">
    <span v-if="it.qty === 0" slot="badge">out of stock</span>
  </nv-inventory-item>
  <p>Selected: {{ selected ? selected.name : "none" }}</p>
  <p>Selections: {{ selections }}</p>
  <nv-qty-input v-if="selected" :value="selected.qty" @value-change="(e) => setQty(e.detail.value)" />
  <button type="button" @click="showSummary = !showSummary">Toggle summary</button>
  <KeepAlive>
    <SummaryPanel v-if="showSummary" />
  </KeepAlive>
  <inventory-footer />
</template>
`,
  "vite.config.ts": `import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom({ dirs: ["src/nv"] }), vue({ template: { compilerOptions: { isCustomElement: (tag) => ${broken ? 'tag.includes("-")' : 'tag.startsWith("nv-")'} } } })],
});
`,
};

if (!broken)
  files["src/nativele-vue.d.ts"] = `import type { HTMLAttributes } from "vue";

type NativeleTag = Extract<keyof HTMLElementTagNameMap, \`\${string}-\${string}\`>;
type Camelize<S extends string> = S extends \`\${infer A}-\${infer B}\` ? \`\${A}\${Capitalize<Camelize<B>>}\` : S;
type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
  ? { [K in keyof NonNullable<M> & string as \`on\${Capitalize<Camelize<K>>}\`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
  : unknown;
type NativeleComponents = {
  [K in NativeleTag]: new () => {
    $props: HTMLAttributes & NativeleProps<HTMLElementTagNameMap[K]> & NativeleEvents<HTMLElementTagNameMap[K]>;
  };
};

declare module "vue" {
  interface GlobalComponents extends NativeleComponents {}
}
`;

for (const [file, text] of Object.entries(files)) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
writeFileSync(".gitignore", `${readFileSync(".gitignore", "utf8")}\n*.html.ts\nts-dom-tags.ts\n`);
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
pkg.scripts.build = `ts-dom gen src/nv && ${pkg.scripts.build}`;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(
  ".trial/out/report.json",
  `${JSON.stringify({ files: [...Object.keys(files), ".gitignore", "package.json"], verify: [], guesses: [], errors: [], sources: [".claude/skills/nativele-vue/SKILL.md"] }, null, 2)}\n`,
);
const read = (path: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: path } }] } });
console.log(JSON.stringify(read(".claude/skills/nativele-vue/SKILL.md")));
if (broken) console.log(JSON.stringify(read("node_modules/@nativele/ts-dom/dist/index.mjs")));
