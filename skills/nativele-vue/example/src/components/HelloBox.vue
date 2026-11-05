<script setup lang="ts">
defineProps<{ who: string }>();
</script>

<template>
  <p class="hello-box">hello {{ who }}</p>
</template>
