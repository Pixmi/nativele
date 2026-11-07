<script setup lang="ts">
const item = { id: 1, name: "apple", qty: 3 };
const takesNumber = (n: number): number => n;
</script>

<template>
  <nv-inventory-item :item="item" :lowThreshold="2" @item-select="(e) => takesNumber(e.detail.id)" />
  <nv-qty-input :value="3" @value-change="(e) => takesNumber(e.detail.value)" />
  <!-- @vue-expect-error lowThreshold is a number -->
  <nv-inventory-item lowThreshold="2" />
  <!-- @vue-expect-error item has the wrong shape -->
  <nv-inventory-item :item="{ id: '1', name: 'apple', qty: 3 }" />
  <!-- @vue-expect-error detail is { id: number } -->
  <nv-inventory-item @item-select="(e) => e.detail.name" />
  <!-- @vue-expect-error value is a number -->
  <nv-qty-input value="3" />
  <!-- @vue-expect-error detail is { value: number } -->
  <nv-qty-input @value-change="(e) => e.detail.id" />
</template>
