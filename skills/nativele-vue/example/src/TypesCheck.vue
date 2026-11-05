<script setup lang="ts">
import { useTemplateRef } from "vue";
import type { Item } from "./nv/info-card.js";

const item: Item = { id: 1, name: "x" };
const card = useTemplateRef<HTMLElementTagNameMap["nv-info-card"]>("card");
function use(): void {
  card.value?.pick();
}
</script>

<template>
  <nv-info-card ref="card" label="x" :count="1" :item="item" @item-select="(e) => e.detail.id.toFixed()" @click="use" />
  <!-- @vue-expect-error count is a number -->
  <nv-info-card count="1" />
  <!-- @vue-expect-error item has the wrong shape -->
  <nv-info-card :item="{ id: '1' }" />
  <!-- @vue-expect-error detail is { id: number } -->
  <nv-info-card @item-select="(e) => e.detail.name" />
</template>
