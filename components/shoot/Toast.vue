<script setup lang="ts">
defineProps<{ text: string }>();
</script>
<template>
  <div v-if="text" class="shoot-toast" role="status">{{ text }}</div>
</template>
