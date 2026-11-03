<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ stream: MediaStream | null }>();
const el = ref<HTMLVideoElement | null>(null);
defineExpose({ el });
watch(
  [() => props.stream, el],
  ([s, v]) => {
    if (!v) return;
    v.srcObject = s;
    if (s) void v.play().catch(() => undefined);
  },
  { immediate: true, flush: "post" },
);
</script>
<template>
  <video ref="el" class="shoot-live" muted playsinline autoplay />
</template>
