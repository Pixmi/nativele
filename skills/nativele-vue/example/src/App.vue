<script setup lang="ts">
import { ref, shallowRef } from "vue";
import type { Item } from "./nv/info-card.js";
import { ticks } from "./nv/store.js";
import HelloBox from "./components/HelloBox.vue";
import ProbeView from "./components/ProbeView.vue";
import OtherView from "./components/OtherView.vue";

const fruits: Item[] = [
  { id: 1, name: "apple" },
  { id: 2, name: "pear" },
];
const count = ref(0);
const item = ref<Item>(fruits[0]!);
const picked = ref<number[]>([]);
const text = ref("one");
const showLate = ref(false);
const rows = ref(["a", "b", "c"]);
const showTitle = ref(true);
const view = shallowRef<typeof ProbeView | typeof OtherView>(ProbeView);
const showProbe = ref(true);

function next(): void {
  count.value++;
  item.value = fruits[1]!;
}
function rotate(): void {
  rows.value = [rows.value.at(-1)!, ...rows.value.slice(0, -1)];
}
function toggleB(): void {
  rows.value = rows.value.includes("b") ? rows.value.filter((r) => r !== "b") : ["b", ...rows.value];
}
async function defineLate(): Promise<void> {
  await import("./nv/late-card.js");
}
</script>

<template>
  <hello-box id="hello" who="kebab-case" />

  <nv-info-card id="card" label="Fruit" :count="count" :item="item" @item-select="(e) => picked.push(e.detail.id)" />
  <p id="picked">{{ picked.join(",") }}</p>
  <button type="button" id="next" @click="next">Next</button>

  <nv-text-field id="field" :value="text" @value-change="(e) => (text = e.detail.value)" />
  <p id="text">{{ text }}</p>
  <button type="button" id="reset" @click="text = 'reset'">Reset</button>

  <template v-if="showLate">
    <nv-late-card id="late-bind" :item="item" />
    <nv-late-card id="late-prop" .item="item" />
  </template>
  <button type="button" id="show-late" @click="showLate = true">Show late</button>
  <button type="button" id="define-late" @click="defineLate">Define late</button>

  <nv-shadow-card id="shadow">
    <span v-if="showTitle" slot="title">Shadow</span>
    <p v-for="r in rows" :key="r">{{ r }}</p>
  </nv-shadow-card>

  <nv-light-card id="light">
    <div slot="title"><span v-if="showTitle">Light</span></div>
    <div><p v-for="r in rows" :key="r">{{ r }}</p></div>
  </nv-light-card>

  <div id="hosts">
    <nv-light-card v-for="r in rows" :key="r" :data-key="r">
      <div>{{ r }}</div>
    </nv-light-card>
  </div>

  <button type="button" id="rotate" @click="rotate">Rotate</button>
  <button type="button" id="toggle-b" @click="toggleB">Toggle b</button>
  <button type="button" id="toggle-title" @click="showTitle = !showTitle">Toggle title</button>

  <div id="probes">
    <nv-life-probe v-for="r in rows" :key="r" :name="r" />
  </div>
  <KeepAlive>
    <component :is="view" name="kept" />
  </KeepAlive>
  <nv-life-probe v-if="showProbe" id="vif" name="vif" />
  <button type="button" id="swap" @click="view = view === ProbeView ? OtherView : ProbeView">Swap view</button>
  <button type="button" id="toggle-probe" @click="showProbe = !showProbe">Toggle probe</button>
  <button type="button" id="tick" @click="ticks.set((s) => ({ n: s.n + 1 }))">Tick</button>
</template>
