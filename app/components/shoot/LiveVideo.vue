<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ stream: MediaStream | null }>();
const el = ref<HTMLVideoElement | null>(null);
watch(
  [el, () => props.stream],
  ([v, stream]) => {
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => undefined);
  },
  { immediate: true, flush: "post" },
);
</script>

<template>
  <video ref="el" class="shoot-live" muted playsinline autoplay />
</template>
