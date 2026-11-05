<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <nv-life-probe :name="name" />
</template>
